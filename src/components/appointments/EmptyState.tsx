interface EmptyStateProps {
    memberName?: string;
    onRefresh?: () => void;
}

export default function EmptyState({ memberName, onRefresh }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-14 h-14 bg-slate-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-700 mb-1">
                Chưa có phiếu khám
            </h3>
            <p className="text-md text-slate-500 text-center mb-5">
                {memberName
                    ? `Chưa có dữ liệu phiếu khám cho ${memberName}`
                    : "Chưa có dữ liệu phiếu khám"
                }
            </p>
            {onRefresh && (
                <button
                    onClick={onRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-md rounded-lg hover:bg-cyan-700 transition-colors duration-200 cursor-pointer"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Tải lại
                </button>
            )}
        </div>
    );
}
