import React from "react";

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    maxHeight?: string;
}

export default function BottomSheet({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    maxHeight = "80vh",
}: BottomSheetProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={onClose}
        >
            <div
                className={`bg-white rounded-t-3xl w-full max-w-4xl max-h-[${maxHeight}] overflow-y-auto`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-teal-600 text-white p-6 rounded-t-3xl">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold">{title}</h3>
                            {subtitle && (
                                <p className="text-sm text-teal-100">{subtitle}</p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
