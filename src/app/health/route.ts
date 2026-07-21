import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "sain-finance",
      sandbox: true,
    },
    { status: 200 },
  );
}
