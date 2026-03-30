import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type CaptureDataResponse = {
  captureId: string;
  manufacturerStats: unknown;
  timelineActivity: unknown;
  devicesSearching: unknown;
};

function assertSafeCaptureId(captureId: string) {
  if (!/^\d{8}$/.test(captureId)) {
    throw new Error("Invalid captureId (expected YYYYMMDD)");
  }
}

async function readJsonFile<T>(absolutePath: string): Promise<T> {
  const raw = await readFile(absolutePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ captureId: string }> },
) {
  try {
    const { captureId } = await ctx.params;
    assertSafeCaptureId(captureId);

    // Read from app-who/public/data/<captureId>/... (ships with the app on Vercel)
    const captureDir = path.resolve(process.cwd(), "public", "data", captureId);

    const manufacturerStatsPath = path.join(
      captureDir,
      "manufacturer_stats.json",
    );
    const timelineActivityPath = path.join(captureDir, "timeline_activity.json");
    const devicesSearchingPath = path.join(captureDir, "devices_searching.json");

    const [manufacturerStats, timelineActivity, devicesSearching] =
      await Promise.all([
        readJsonFile<unknown>(manufacturerStatsPath),
        readJsonFile<unknown>(timelineActivityPath),
        readJsonFile<unknown>(devicesSearchingPath),
      ]);

    const body: CaptureDataResponse = {
      captureId,
      manufacturerStats,
      timelineActivity,
      devicesSearching,
    };

    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

