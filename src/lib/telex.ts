// Bộ gõ tiếng Việt kiểu Telex cho app kiosk.
//
// Vì sao app phải tự gõ: máy kiosk ở sảnh không cài Unikey/EVKey, và bàn phím ảo của
// app thì hệ điều hành không can thiệp vào được. Không có bộ gõ thì NVYT không nhập
// nổi tên bệnh nhân có dấu, mà backend so tên với hồ sơ HIS theo ĐÚNG dấu.
//
// Máy CÓ sẵn Unikey vẫn dùng bình thường: bộ gõ của hệ điều hành nuốt phím trước, ô
// nhập chỉ nhận được chữ đã có dấu nên hàm dưới đây không có gì để biến đổi.
//
// Quy tắc hỗ trợ:
//   s f r x j  → sắc, huyền, hỏi, ngã, nặng      (vux → vũ, nguyeenx → nguyễn)
//   aa ee oo   → â ê ô                            (aa → â)
//   aw ow uw   → ă ơ ư, và w đứng sau u/o/a       (uw → ư, w sau "uo" → ươ)
//   dd         → đ
//   gõ lại đúng phím dấu vừa dùng → bỏ dấu, trả lại chữ cái (toanss → toans)

const TONE_BY_KEY: Record<string, string> = {
  s: "́", // sắc
  f: "̀", // huyền
  r: "̉", // hỏi
  x: "̃", // ngã
  j: "̣", // nặng
};

const TONE_MARKS = ["̀", "́", "̃", "̉", "̣"];
const TONE_RE = /[̣̀́̃̉]/g;

/** Nguyên âm đã bỏ dấu thanh (còn giữ mũ/móc). */
const VOWELS = "aăâeêioôơuưy";

function bare(ch: string): string {
  return ch.normalize("NFD").replace(TONE_RE, "").normalize("NFC");
}

function isVowel(ch: string): boolean {
  return VOWELS.includes(bare(ch).toLowerCase());
}

/** Giữ nguyên hoa/thường của ký tự gốc khi thay chữ. */
function matchCase(sample: string, replacement: string): string {
  return sample === sample.toUpperCase() && sample !== sample.toLowerCase()
    ? replacement.toUpperCase()
    : replacement;
}

function splitLastWord(text: string): [string, string] {
  const i = text.lastIndexOf(" ");
  return i < 0 ? ["", text] : [text.slice(0, i + 1), text.slice(i + 1)];
}

/** Dấu thanh hiện có trong từ, null nếu chưa có. */
function currentTone(word: string): string | null {
  const d = word.normalize("NFD");
  for (const m of TONE_MARKS) if (d.includes(m)) return m;
  return null;
}

function stripTone(word: string): string {
  return word.normalize("NFD").replace(TONE_RE, "").normalize("NFC");
}

/**
 * Chọn nguyên âm mang dấu trong một từ.
 *
 * Ưu tiên nguyên âm có mũ/móc (â ê ô ơ ư ă) vì tiếng Việt luôn đánh dấu ở đó
 * (nguyễn → ê, được → ơ). Còn lại: vần có hai nguyên âm thì dấu rơi vào nguyên âm
 * đầu nếu từ kết thúc bằng nguyên âm (hoà), vào nguyên âm sau nếu còn phụ âm cuối
 * (toán). Đây là xấp xỉ đủ dùng cho họ tên, không phải bộ luật chính tả đầy đủ.
 */
function toneTargetIndex(word: string): number {
  const chars = [...word];
  const vowelIdx = chars.map((c, i) => (isVowel(c) ? i : -1)).filter((i) => i >= 0);
  if (vowelIdx.length === 0) return -1;

  // Lấy nguyên âm đặc biệt CUỐI CÙNG: vần "ươ" có hai cái (ư và ơ) mà dấu luôn nằm ở
  // ơ — được, rượu, Đượng. Lấy cái đầu sẽ ra "đựơc".
  const specials = vowelIdx.filter((i) => "ăâêôơư".includes(bare(chars[i]).toLowerCase()));
  if (specials.length > 0) return specials[specials.length - 1];

  if (vowelIdx.length === 1) return vowelIdx[0];

  const last = vowelIdx[vowelIdx.length - 1];
  const endsWithVowel = last === chars.length - 1;
  // "uy" là vần đặc biệt: thuý, tuỳ — dấu vẫn ở nguyên âm đầu.
  if (endsWithVowel) return vowelIdx[vowelIdx.length - 2];
  return last;
}

function applyToneToWord(word: string, mark: string): string | null {
  const idx = toneTargetIndex(word);
  if (idx < 0) return null;
  const clean = [...stripTone(word)];
  const target = clean[idx];
  clean[idx] = (target.normalize("NFD") + mark).normalize("NFC");
  return clean.join("");
}

/** aa→â, ee→ê, oo→ô. Trả null nếu không áp dụng được. */
function applyCircumflex(word: string, ch: string): string | null {
  if (!"aeo".includes(ch.toLowerCase())) return null;
  const chars = [...word];
  const lastIdx = chars.length - 1;
  if (lastIdx < 0) return null;
  const lastBare = bare(chars[lastIdx]).toLowerCase();
  if (lastBare !== ch.toLowerCase()) return null;

  const hat: Record<string, string> = { a: "â", e: "ê", o: "ô" };
  const tone = currentTone(word); // giữ lại dấu thanh đã gõ trước đó (vd "tuaans")
  const base = matchCase(chars[lastIdx], hat[ch.toLowerCase()]);
  chars[lastIdx] = tone ? (base.normalize("NFD") + tone).normalize("NFC") : base;
  return chars.join("");
}

/**
 * w → ư/ơ/ă, và cả vần "uo" → "ươ".
 *
 * Phải tìm theo CỤM NGUYÊN ÂM chứ không phải hai ký tự cuối: "duong" + w là "dương",
 * cụm nguyên âm "uo" nằm giữa, sau nó còn "ng". Chỉ nhìn hai ký tự cuối thì ra "duơng".
 */
function applyHorn(word: string): string | null {
  const chars = [...word];
  const tone = currentTone(word);
  const stripped = [...stripTone(word)];

  // Cụm nguyên âm cuối cùng: bỏ qua phụ âm đuôi rồi gom ngược các nguyên âm liền nhau.
  let end = stripped.length - 1;
  while (end >= 0 && !isVowel(stripped[end])) end--;
  if (end < 0) return null;
  let start = end;
  while (start - 1 >= 0 && isVowel(stripped[start - 1])) start--;

  const at = (i: number) => bare(stripped[i]).toLowerCase();
  const finish = () => {
    const out = stripped.join("");
    return tone ? (applyToneToWord(out, tone) ?? out) : out;
  };

  if (end > start && at(end - 1) === "u" && at(end) === "o") {
    stripped[end - 1] = matchCase(chars[end - 1], "ư");
    stripped[end] = matchCase(chars[end], "ơ");
    return finish();
  }

  const horn: Record<string, string> = { u: "ư", o: "ơ", a: "ă" };
  for (let i = end; i >= start; i--) {
    const h = horn[at(i)];
    if (h) {
      stripped[i] = matchCase(chars[i], h);
      return finish();
    }
  }
  return null;
}

/**
 * Gõ thêm MỘT ký tự vào cuối chuỗi theo luật Telex.
 * Không áp dụng được luật nào thì nối thẳng ký tự đó.
 */
export function telexAppend(value: string, ch: string): string {
  if (ch.length !== 1) return value + ch;
  const [head, word] = splitLastWord(value);
  const lower = ch.toLowerCase();

  // dd → đ
  if (lower === "d" && word.length > 0) {
    const lastChar = word[word.length - 1];
    if (bare(lastChar).toLowerCase() === "d") {
      return head + word.slice(0, -1) + matchCase(lastChar, "đ");
    }
  }

  // Dấu thanh
  const mark = TONE_BY_KEY[lower];
  if (mark && word.length > 0) {
    const existing = currentTone(word);
    // Gõ lại đúng phím dấu đang có → bỏ dấu và nhận ký tự đó như chữ thường (kiểu Telex).
    if (existing === mark) return head + stripTone(word) + ch;
    const toned = applyToneToWord(word, mark);
    if (toned) return head + toned;
  }

  // aa/ee/oo → â/ê/ô
  const hat = applyCircumflex(word, ch);
  if (hat) return head + hat;

  // w → ư/ơ/ă
  if (lower === "w") {
    const horned = applyHorn(word);
    if (horned) return head + horned;
  }

  return value + ch;
}

/**
 * Đánh dấu thanh cho từ cuối của chuỗi — dùng cho các phím dấu rời trên bàn phím ảo
 * (NVYT gõ xong cả chữ rồi mới bấm dấu). Cùng luật chọn nguyên âm với Telex nên hai
 * cách gõ cho ra cùng kết quả.
 */
export function applyToneToLastWord(value: string, mark: string): string {
  const [head, word] = splitLastWord(value);
  if (!word) return value;
  const toned = applyToneToWord(word, mark);
  return toned ? head + toned : value;
}

/**
 * Dùng cho <input>: so chuỗi mới với chuỗi cũ, chỉ chạy Telex khi người dùng vừa GÕ
 * THÊM đúng một ký tự ở cuối. Dán, xoá, sửa giữa chuỗi thì giữ nguyên.
 *
 * Nhờ vậy máy có Unikey không bị gõ hai lần: Unikey đã nuốt phím dấu và trả về chữ
 * có dấu sẵn, chuỗi mới không phải là "chuỗi cũ + một phím dấu" nên hàm này không đụng vào.
 */
export function telexOnInput(prev: string, next: string): string {
  if (next.length === prev.length + 1 && next.startsWith(prev)) {
    return telexAppend(prev, next[next.length - 1]);
  }
  return next;
}
