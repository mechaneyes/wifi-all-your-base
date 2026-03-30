"use client";

import { type Sketch } from "@p5-wrapper/react";
import { NextReactP5Wrapper } from "@p5-wrapper/next";
import { useEffect, useMemo, useState } from "react";

type ManufacturerStats = {
  timestamp?: string;
  total_manufacturers?: number;
  manufacturers: Array<{
    manufacturer: string;
    count: number;
    avg_signal?: number;
    total_bytes?: number;
    avg_bytes?: number;
  }>;
};

type TimelineActivity = {
  bin_minutes: number;
  total_bins: number;
  timeline: Array<{
    timestamp: number;
    datetime: string;
    count: number;
    manufacturers: Record<string, number>;
    devices?: Array<{
      manufacturer: string;
      device_name: string;
      common_name: string;
      type: string;
    }>;
  }>;
};

type SearchingDevice = {
  devmac?: string;
  common_name?: string;
  manufacturer?: string;
  searching_for_networks?: string[];
};

type CaptureDataResponse = {
  captureId: string;
  manufacturerStats: ManufacturerStats;
  timelineActivity: TimelineActivity;
  devicesSearching: SearchingDevice[];
};

type SparklineProps = {
  series: number[];
  width?: number;
  height?: number;
};

const sparklineSketch: Sketch<SparklineProps> = (p5) => {
  let props: SparklineProps = { series: [], width: 140, height: 28 };

  p5.setup = () => {
    p5.createCanvas(props.width ?? 140, props.height ?? 28);
    p5.pixelDensity(2);
    p5.noLoop();
  };

  p5.updateWithProps = (nextProps) => {
    props = {
      series: Array.isArray(nextProps.series) ? nextProps.series : [],
      width: nextProps.width ?? 140,
      height: nextProps.height ?? 28,
    };
    p5.resizeCanvas(props.width ?? 140, props.height ?? 28);
    p5.redraw();
  };

  p5.draw = () => {
    const w = props.width ?? 140;
    const h = props.height ?? 28;
    const s = props.series ?? [];

    p5.clear();

    if (!s.length) return;

    let minV = Infinity;
    let maxV = -Infinity;
    for (const v of s) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return;
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }

    const pad = 2;
    p5.noFill();
    p5.stroke(90);
    p5.strokeWeight(1.25);

    p5.beginShape();
    for (let i = 0; i < s.length; i++) {
      const x = p5.map(i, 0, s.length - 1, pad, w - pad);
      const y = p5.map(s[i], minV, maxV, h - pad, pad);
      p5.vertex(x, y);
    }
    p5.endShape();
  };
};

function formatInt(n: number) {
  return new Intl.NumberFormat().format(n);
}

export default function Home() {
  const [captureId, setCaptureId] = useState("20260331");
  const [data, setData] = useState<CaptureDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    fetch(`/api/capture/${encodeURIComponent(captureId)}/data`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? "Failed to load capture data");
        return json as CaptureDataResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      });

    return () => {
      cancelled = true;
    };
  }, [captureId]);

  const topManufacturers = useMemo(() => {
    const manufacturers = data?.manufacturerStats?.manufacturers ?? [];
    return [...manufacturers]
      .filter((m) => typeof m?.manufacturer === "string")
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 25);
  }, [data]);

  useEffect(() => {
    if (!topManufacturers.length) return;
    if (selectedManufacturer) return;
    setSelectedManufacturer(topManufacturers[0].manufacturer);
  }, [topManufacturers, selectedManufacturer]);

  const seriesByManufacturer = useMemo(() => {
    const timeline = data?.timelineActivity?.timeline ?? [];
    const map = new Map<string, number[]>();

    for (const m of topManufacturers) {
      const series = timeline.map((bin) => bin.manufacturers?.[m.manufacturer] ?? 0);
      map.set(m.manufacturer, series);
    }
    return map;
  }, [data, topManufacturers]);

  const manufacturersWithDeviceNames = useMemo(() => {
    const set = new Set<string>();
    const timeline = data?.timelineActivity?.timeline ?? [];
    for (const bin of timeline) {
      const devices = bin.devices ?? [];
      for (const d of devices) {
        const manu = typeof d?.manufacturer === "string" ? d.manufacturer : "";
        const name = typeof d?.device_name === "string" ? d.device_name.trim() : "";
        if (manu && name) set.add(manu);
      }
    }
    return set;
  }, [data]);

  const ssidCounts = useMemo(() => {
    const target = selectedManufacturer;
    if (!target) return [];
    const devices = data?.devicesSearching ?? [];

    const ssidToDeviceCount = new Map<string, number>();

    for (const d of devices) {
      if ((d.manufacturer ?? "Unknown") !== target) continue;
      const ssids = d.searching_for_networks ?? [];
      if (!Array.isArray(ssids) || ssids.length === 0) continue;

      const seenThisDevice = new Set<string>();
      for (const raw of ssids) {
        const ssid = typeof raw === "string" ? raw.trim() : "";
        if (!ssid) continue;
        if (seenThisDevice.has(ssid)) continue;
        seenThisDevice.add(ssid);
      }

      for (const ssid of seenThisDevice) {
        ssidToDeviceCount.set(ssid, (ssidToDeviceCount.get(ssid) ?? 0) + 1);
      }
    }

    return [...ssidToDeviceCount.entries()]
      .map(([ssid, devicesCount]) => ({ ssid, devicesCount }))
      .sort((a, b) => b.devicesCount - a.devicesCount)
      .slice(0, 50);
  }, [data, selectedManufacturer]);

  const isNonSsidSentinel = (ssid: string) =>
    ssid.trim().toLowerCase() === "no probe ssids found for this manufacturer.";

  return (
    <div className="flex flex-col flex-1 bg-black text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#000d10]/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">
              Who is out there
            </h1>
            <p className="text-sm text-zinc-400">
              Manufacturer presence + probe SSIDs (p5 sparklines)
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">capture</span>
            <input
              value={captureId}
              onChange={(e) => setCaptureId(e.target.value)}
              className="w-28 rounded-md border border-white/10 bg-[#000d10] px-2 py-1 font-mono text-sm text-zinc-50"
              placeholder="YYYYMMDD"
              inputMode="numeric"
            />
          </label>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-5">
        <section className="md:col-span-3">
          <div className="rounded-xl border border-white/10 bg-[#000d10] p-3">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Top manufacturers</h2>
              <div className="text-xs text-zinc-400">
                {data?.timelineActivity?.total_bins
                  ? `${data.timelineActivity.total_bins} bins × ${data.timelineActivity.bin_minutes} min`
                  : "loading…"}
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            ) : !data ? (
              <div className="p-3 text-sm text-zinc-400">Loading capture…</div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-white/10">
                <div className="grid grid-cols-[1fr_90px_160px] gap-0 border-b border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-400">
                  <div>manufacturer</div>
                  <div className="text-right">count</div>
                  <div className="text-right">trend</div>
                </div>
                <div className="max-h-[40vh] overflow-y-auto md:max-h-[70vh]">
                  {topManufacturers.map((m, idx) => {
                    const isSelected = selectedManufacturer === m.manufacturer;
                    const series = seriesByManufacturer.get(m.manufacturer) ?? [];
                    return (
                      <button
                        key={m.manufacturer}
                        type="button"
                        onClick={() => setSelectedManufacturer(m.manufacturer)}
                        className={[
                          "grid w-full grid-cols-[1fr_90px_160px] items-center gap-0 px-3 py-2 text-left text-sm",
                          "border-b border-white/5 hover:bg-white/5",
                          isSelected
                            ? "bg-[#1a2528]"
                            : idx % 2 === 0
                              ? "bg-[#001216ba]"
                              : "bg-[#000d10]",
                        ].join(" ")}
                      >
                        <div className="truncate pr-2 font-medium">
                          <span className="truncate">{m.manufacturer}</span>
                        </div>
                        <div className="text-right font-mono text-xs text-zinc-300">
                          {formatInt(m.count)}
                        </div>
                        <div className="flex justify-end">
                          <NextReactP5Wrapper
                            sketch={sparklineSketch}
                            series={series}
                            width={140}
                            height={28}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="md:col-span-2">
          <div className="rounded-xl border border-white/10 bg-[#000d10] p-3">
            <h2 className="text-sm font-semibold">Probe SSIDs</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Selected manufacturer:{" "}
              <span className="font-medium text-zinc-50">
                {selectedManufacturer ?? "—"}
              </span>
            </p>

            {!data ? (
              <div className="mt-3 text-sm text-zinc-400">Loading…</div>
            ) : (
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
                <div className="grid grid-cols-[1fr_64px] gap-0 border-b border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-400">
                  <div>SSID (raw)</div>
                  <div className="text-right">devices</div>
                </div>
                <div className="max-h-[70vh] overflow-y-auto">
                  {ssidCounts.length ? (
                    ssidCounts.map(({ ssid, devicesCount }, idx) => (
                      <div
                        key={ssid}
                        className={[
                          "grid grid-cols-[1fr_64px] items-center gap-0 border-b border-white/5 px-3 py-2 text-sm",
                          idx % 2 === 0 ? "bg-[#001216ba]" : "bg-[#000d10]",
                        ].join(" ")}
                      >
                        <div
                          className={[
                            "truncate pr-2",
                            isNonSsidSentinel(ssid)
                              ? "text-zinc-600"
                              : "",
                          ].join(" ")}
                          title={ssid}
                        >
                          {ssid}
                        </div>
                        <div className="text-right font-mono text-xs text-zinc-300">
                          {formatInt(devicesCount)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-3 text-sm text-zinc-400">
                      No probe SSIDs found for this manufacturer.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
