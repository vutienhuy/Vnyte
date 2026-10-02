import React from "react";

interface AlertBannerProps {
    type: "success" | "error" | "warning" | "info";
    message: string;
    onClose?: () => void;
    className?: string;
}

export default function AlertBanner({
    type,
    message,
    onClose,
    className = "",
}: AlertBannerProps) {
    const styles = {
        success: {
            bg: "bg-green-50",
            border: "border-green-200",
            text: "text-green-700",
            icon: "✅",
        },
        error: {
            bg: "bg-red-50",
            border: "border-red-200",
            text: "text-red-700",
            icon: "❌",
        },
        warning: {
            bg: "bg-amber-50",
            border: "border-amber-200",
            text: "text-amber-700",
            icon: "⚠️",
        },
        info: {
            bg: "bg-blue-50",
            border: "border-blue-200",
            text: "text-blue-700",
            icon: "ℹ️",
        },
    };

    const style = styles[type];

    return (
        <div
            className={`mt-4 p-4 ${style.bg} border ${style.border} rounded-xl ${style.text} text-center ${className}`}
        >
            {style.icon} {message}
            {onClose && (
                <button
                    onClick={onClose}
                    className="ml-2 font-bold hover:opacity-70"
                >
                    ×
                </button>
            )}
        </div>
    );
}
