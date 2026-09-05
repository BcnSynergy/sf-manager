import QRCode from 'qrcode';

type ElementQrCodeProps = {
  code: string;
  sizeMm?: number;
};

// design.md Decision 5: `qrcode` (npm), rendered as one <rect> per module,
// error correction 'H'. `QRCode.create` returns a synchronous BitMatrix
// (`modules`) — no canvas, no async renderer, so this component owns the
// SVG markup itself rather than delegating to `qrcode`'s own renderers
// (`toString({type:'svg'})` emits one merged <path>, which the decode test
// cannot read back into a matrix — see Decision 5's rejected alternatives).
const ERROR_CORRECTION_LEVEL = 'H';

// design.md Decision 7: QR renders at 25mm (~1.2mm per module at version 1)
// with `shape-rendering: crispEdges` so print doesn't anti-alias module
// edges into unscannable grey.
const DEFAULT_SIZE_MM = 25;

export function ElementQrCode({ code, sizeMm = DEFAULT_SIZE_MM }: ElementQrCodeProps) {
  const { modules } = QRCode.create(code, {
    errorCorrectionLevel: ERROR_CORRECTION_LEVEL,
  });
  const { size } = modules;

  const rects = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (modules.get(row, col)) {
        rects.push(<rect key={`${row}-${col}`} x={col} y={row} width={1} height={1} />);
      }
    }
  }

  return (
    <svg
      data-testid="element-qr-code"
      viewBox={`0 0 ${size} ${size}`}
      width={`${sizeMm}mm`}
      height={`${sizeMm}mm`}
      shapeRendering="crispEdges"
      fill="#000"
      role="img"
      aria-label={code}
    >
      {rects}
    </svg>
  );
}
