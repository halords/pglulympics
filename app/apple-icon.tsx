import { ImageResponse } from "next/og";

// Apple touch icon (180×180 PNG, rendered at runtime): the same tab mark —
// navy tile, bone "P", crimson base band — as app/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="180" height="180">
        <defs>
          <clipPath id="tile">
            <rect width="64" height="64" rx="14" />
          </clipPath>
        </defs>
        <g clipPath="url(#tile)">
          <rect width="64" height="64" fill="#0A2450" />
          <rect y="56" width="64" height="8" fill="#C1272D" />
        </g>
        <rect x="19" y="13" width="9" height="34" fill="#F4F1EA" />
        <path d="M26.5 17.5 H37 a7.25 7.25 0 0 1 0 14.5 H26.5" fill="none" stroke="#F4F1EA" strokeWidth="9" />
      </svg>
    ),
    { ...size },
  );
}
