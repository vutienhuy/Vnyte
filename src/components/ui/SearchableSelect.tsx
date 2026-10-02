import { useEffect, useRef, useState } from "react";

// ─── SearchableSelect ────────────────────────────────────────────────────────
interface SearchableSelectProps<T> {
    label: string;
    placeholder: string;
    items: T[];
    value: T | null;
    getKey: (it: T) => string | number;
    getLabel: (it: T) => string;
    onChange: (it: T | null) => void;
    loading?: boolean;
    disabled?: boolean;
    /**
     * Cỡ chữ/ô lớn cho màn tiếp đón trên kiosk (màn đứng, NVYT nhìn từ xa hơn).
     * Luồng tự phục vụ giữ cỡ cũ để không vỡ bố cục các màn đã có.
     */
    touchSize?: boolean;
}

function SearchableSelect<T>({
    label, placeholder, items, value, getKey, getLabel, onChange, loading, disabled, touchSize,
}: SearchableSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false); setQuery("");
            }
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    const filtered = query
        ? items.filter(it => getLabel(it).toLowerCase().includes(query.toLowerCase()))
        : items;

    return (
        <div className="relative" ref={ref}>
            <label className="block text-2xl font-medium text-slate-500 mb-1">{label}</label>
            <button
                type="button"
                disabled={disabled || loading}
                onClick={() => { setOpen(!open); setQuery(""); }}
                className={`w-full border-2 rounded-2xl px-5 py-4 min-h-[80px] text-left text-2xl flex items-center justify-between transition focus:outline-none focus:ring-2 focus:ring-cyan-500
          ${disabled || loading
                        ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed"
                        : "bg-white border-slate-200 text-slate-800 hover:border-cyan-400 cursor-pointer"}`}
            >
                <span className={value ? "text-slate-800 text-2xl" : "text-slate-400 text-2xl"}>
                    {loading ? "Đang tải..." : value ? getLabel(value) : placeholder}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && !disabled && !loading && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                        <input
                            autoFocus
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={query}
                            onFocus={() => {
                                if (!touchSize) return;
                                // Bàn phím cảm ứng của Windows che nửa dưới màn hình và
                                // KHÔNG đẩy trang lên. Kéo ô lên đầu viewport để phần kết
                                // quả đang lọc nằm gọn phía trên bàn phím.
                                requestAnimationFrame(() =>
                                    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
                            }}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Tìm kiếm..."
                            className={`w-full border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                                touchSize ? "px-4 py-3 text-2xl min-h-[64px]" : "px-3 py-2 text-xl"
                            }`}
                        />
                    </div>
                    <div className={`overflow-y-auto ${touchSize ? "max-h-72" : "max-h-52"}`}>
                        {filtered.length === 0 ? (
                            <p className="text-center text-slate-400 text-sm py-4">
                                {items.length === 0 ? "Không có dữ liệu" : "Không tìm thấy kết quả"}
                            </p>
                        ) : (
                            filtered.map(it => (
                                <button
                                    key={getKey(it)}
                                    type="button"
                                    onClick={() => { onChange(it); setOpen(false); setQuery(""); }}
                                    className={`w-full text-left transition-colors hover:bg-cyan-50 hover:text-cyan-700 cursor-pointer
                    ${touchSize ? "px-4 py-4 text-2xl" : "px-4 py-2.5 text-xl"}
                    ${value && getKey(value) === getKey(it) ? "bg-cyan-50 text-cyan-700 font-medium" : "text-slate-700"}`}
                                >
                                    {getLabel(it)}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

export default SearchableSelect;
