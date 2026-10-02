import React from "react";

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    color?: string;
    className?: string;
}

export default function LoadingSpinner({
    size = "md",
    color = "border-teal-600",
    className = "",
}: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "h-6 w-6 border-2",
        md: "h-12 w-12 border-b-2",
        lg: "h-16 w-16 border-b-2",
    };

    return (
        <div className={`flex justify-center py-12 ${className}`}>
            <div
                className={`animate-spin rounded-full ${sizeClasses[size]} ${color}`}
            ></div>
        </div>
    );
}
