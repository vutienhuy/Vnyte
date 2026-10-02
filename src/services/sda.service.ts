
const SDA_BASE = "https://sda.onelink.vn";

export interface SdaNational {
    ID?: number;
    CREATE_TIME?: number;
    MODIFY_TIME?: number;
    CREATOR?: string;
    MODIFIER?: string;
    APP_CREATOR?: string;
    APP_MODIFIER?: string;
    IS_DELETE?: number;
    IS_ACTIVE?: number;
    GROUP_CODE: string;
    NATIONAL_CODE?: string;
    NATIONAL_NAME?: string;
    NATIONAL_ID?: number;
    MPS_NATIONAL_CODE?: string;
    SDA_PROVINCE: string;
}

export interface SdaEthnic {
    ID?: number;
    IS_ACTIVE?: number;
    ETHNIC_CODE?: string;
    ETHNIC_NAME?: string;
    OTHER_NAME?: string;
}

export interface SdaProvince {
    ID?: number;
    IS_ACTIVE?: number;
    IS_NO_DISTRICT?: number | null;
    PROVINCE_CODE?: string;
    PROVINCE_NAME?: string;
    NATIONAL_ID?: number;
    SEARCH_CODE?: string;
}

export interface SdaCommune {
    ID?: number;
    IS_ACTIVE?: number;
    COMMUNE_CODE?: string;
    COMMUNE_NAME?: string;
    INITIAL_NAME?: string;
    PROVINCE_ID?: number;
    SEARCH_CODE?: string;
}

/** Encode params object thành base64 UTF-8 rồi append vào URL */
function buildSdaUrl(path: string, params: Record<string, any>): string {
    const json = JSON.stringify({ 'ApiData': params });
    const encoded = btoa(unescape(encodeURIComponent(json)));
    return `${SDA_BASE}${path}?param=${encoded}`;
}

const SDA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

function getCacheKey(path: string, params: Record<string, any>): string {
    return `sda_cache_${path}_${JSON.stringify(params)}`;
}

// ── Cache danh mục: localStorage trước, sessionStorage là lưới đỡ ────────────
//
// Trước đây chỉ dùng sessionStorage "để tránh đầy quota", nhưng TTL 7 ngày với
// sessionStorage là mâu thuẫn: sessionStorage chết theo phiên nên không bao giờ
// sống nổi 7 ngày. Hệ quả trên kiosk: mỗi lần khởi động lại (và ngay sau khi
// cấu hình license + 2ID) là tải lại TOÀN BỘ danh mục xã cả nước — đúng cửa sổ
// mà người dùng chạm thẻ đầu tiên.
//
// Giờ ghi localStorage để qua được lần khởi động lại. Vẫn giữ nguyên mối lo
// quota: nếu localStorage đầy thì tự hạ xuống sessionStorage, hỏng nữa thì bỏ
// cache chứ KHÔNG để văng lỗi — cache hỏng không được phép làm chết màn hình.

/** Đọc cache: ưu tiên localStorage (sống qua restart), rồi tới sessionStorage. */
function readCache<T>(key: string): T[] | null {
    if (typeof window === "undefined") return null;
    for (const store of [localStorage, sessionStorage]) {
        try {
            const cached = store.getItem(key);
            if (!cached) continue;
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < SDA_CACHE_TTL_MS && Array.isArray(data) && data.length > 0) {
                return data as T[];
            }
            // Hết hạn hoặc rỗng → dọn luôn cho khỏi phình.
            store.removeItem(key);
        } catch {
            try { store.removeItem(key); } catch { /* ignore */ }
        }
    }
    return null;
}

/** Ghi cache: localStorage, đầy quota thì lùi về sessionStorage, hỏng nữa thì thôi. */
function writeCache<T>(key: string, data: T[]): void {
    if (typeof window === "undefined" || !data.length) return;
    const payload = JSON.stringify({ data, ts: Date.now() });
    try {
        localStorage.setItem(key, payload);
        return;
    } catch { /* quota/private mode → thử sessionStorage */ }
    try {
        sessionStorage.setItem(key, payload);
    } catch { /* hết chỗ thật → chạy không cache, chấp nhận chậm hơn */ }
}

async function sdaGet<T>(path: string, params: Record<string, any>): Promise<T[]> {
    const cacheKey = typeof window !== "undefined" ? getCacheKey(path, params) : "";
    if (cacheKey) {
        const hit = readCache<T>(cacheKey);
        if (hit) return hit;
    }

    // Gọi API
    const url = buildSdaUrl(path, params);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SDA API error: ${res.status}`);
    const json = await res.json();

    // Parse response (thử nhiều cấu trúc)
    let result: T[] = [];
    if (Array.isArray(json)) {
        result = json as T[];
    } else {
        for (const key of ["data", "result", "ApiData", "items", "records", "rows", "Data", "Result"]) {
            if (json[key] && Array.isArray(json[key])) { result = json[key] as T[]; break; }
        }
        if (result.length === 0) {
            const arr = Object.values(json).find(v => Array.isArray(v));
            if (arr) result = arr as T[];
        }
    }

    if (cacheKey) writeCache(cacheKey, result);

    return result;
}

/** Lấy danh sách quốc tịch */
export async function getSdaNationals(): Promise<SdaNational[]> {
    return sdaGet<SdaNational>("/api/SdaNational/Get", {
        IS_ACTIVE: 1,
        OrderField: "ID",
        OrderDirection: "ASC",
    });
}

/** Lấy danh sách dân tộc */
export async function getSdaEthnics(): Promise<SdaEthnic[]> {
    return sdaGet<SdaEthnic>("/api/SdaEthnic/Get", {
        IS_ACTIVE: 1,
        OrderField: "ETHNIC_CODE",
        OrderDirection: "ASC",
    });
}

/**
 * Lấy danh sách tỉnh (chỉ hiển thị khi IS_NO_DISTRICT == 1)
 */
export async function getSdaProvinces(): Promise<SdaProvince[]> {
    const all = await sdaGet<SdaProvince>("/api/SdaProvince/Get", {
        IS_ACTIVE: 1,
        OrderField: "PROVINCE_CODE",
        OrderDirection: "ASC",
    });
    return all.filter((p) => p.IS_NO_DISTRICT === 1);
}

/**
 * Lấy danh sách xã, lọc theo provinceId
 */
export async function getSdaCommunes(provinceId?: number): Promise<SdaCommune[]> {
    const all = await sdaGet<SdaCommune>("/api/SdaCommune/Get", {
        IS_ACTIVE: 1,
        OrderField: "DISTRICT_CODE",
        OrderDirection: "ASC",
    });
    if (provinceId != null) {
        return all.filter((c) => c.PROVINCE_ID === provinceId);
    }
    return all;
}
