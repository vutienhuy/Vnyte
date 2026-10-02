// CODE128 (subset B) → inline SVG string. KHÔNG phụ thuộc CDN/JS ngoài → in im lặng offline ổn định.
// Dùng cho phiếu khám/biên lai 80mm trên kiosk (thay JsBarcode CDN).

const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const STOP = 106;

/** Sinh SVG barcode CODE128-B cho `value`. height tính theo px (mặc định 40). */
export function code128Svg(value: string, opts: { height?: number; moduleWidth?: number } = {}): string {
  const v = (value || "").replace(/[^\x20-\x7E]/g, ""); // chỉ ASCII in được
  if (!v) return "";
  const height = opts.height ?? 40;
  const mw = opts.moduleWidth ?? 1.5;

  const codes: number[] = [START_B];
  let sum = START_B;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i) - 32; // subset B
    codes.push(c);
    sum += c * (i + 1);
  }
  codes.push(sum % 103); // checksum
  codes.push(STOP);

  let x = 0;
  const rects: string[] = [];
  for (const code of codes) {
    const pat = PATTERNS[code];
    let bar = true;
    for (const ch of pat) {
      const w = parseInt(ch, 10) * mw;
      if (bar) rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`);
      x += w;
      bar = !bar;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x.toFixed(2)} ${height}" width="100%" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><g fill="#000">${rects.join("")}</g></svg>`;
}
