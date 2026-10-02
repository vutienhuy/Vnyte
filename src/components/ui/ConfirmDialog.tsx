import React, { useEffect } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "success" | "warning" | "danger";
    icon?: "check" | "warning" | "info";
}

export default function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Xác nhận",
    cancelText = "Hủy",
    variant = "success",
    icon = "check",
}: ConfirmDialogProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        }

        return () => {
            document.body.style.overflow = 'unset';
            document.body.style.paddingRight = '0px';
        };
    }, [isOpen]);

    if (!isOpen) return null;
    if (typeof window === 'undefined') return null;

    const variants = {
        success: {
            iconBg: "bg-teal-100",
            iconColor: "text-teal-600",
            buttonBg: "bg-blue-900",
            buttonHover: "hover:shadow-lg",
        },
        warning: {
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
            buttonBg: "bg-amber-500",
            buttonHover: "hover:bg-amber-600 hover:shadow-lg",
        },
        danger: {
            iconBg: "bg-red-100",
            iconColor: "text-red-600",
            buttonBg: "bg-red-500",
            buttonHover: "hover:bg-red-600 hover:shadow-lg",
        },
    };

    const icons = {
        check: (
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        ),
        warning: (
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
        ),
        info: (
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
        ),
    };

    const style = variants[variant];

    const dialogContent = (
        <div
            className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center p-4"
            onClick={onClose}
            style={{
                zIndex: 999999,
                position: 'fixed',
            }}
        >
            <div
                className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
                style={{ maxHeight: '90vh', overflowY: 'auto' }}
            >
                <div className="flex items-center mb-4">
                    <div
                        className={`w-12 h-12 ${style.iconBg} rounded-full flex items-center justify-center mr-4`}
                    >
                        <svg
                            className={`w-6 h-6 ${style.iconColor}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            {icons[icon]}
                        </svg>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900">{title}</h3>
                </div>

                <p className="text-gray-600 mb-6 text-2xl">{message}</p>

                <div className="flex gap-3">
                    {cancelText && (
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 cursor-pointer text-xl"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-3 ${style.buttonBg} text-white font-semibold rounded-xl ${style.buttonHover} cursor-pointer text-xl`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(dialogContent, document.body);
}
