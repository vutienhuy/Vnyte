interface AppointmentStatusBadgeProps {
    status?: string;
}

export default function AppointmentStatusBadge({ status }: AppointmentStatusBadgeProps) {
    const getStatusInfo = (status?: string) => {
        const statusMap: Record<string, { label: string; bgColor: string; textColor: string }> = {
            PENDING: {
                label: "Chờ xác nhận",
                bgColor: "bg-orange-500",
                textColor: "text-white"
            },
            CONFIRMED: {
                label: "Đã xác nhận",
                bgColor: "bg-teal-500",
                textColor: "text-white"
            },
            CANCELLED: {
                label: "Đã hủy",
                bgColor: "bg-red-500",
                textColor: "text-white"
            },
            CHECKED_IN: {
                label: "Đã check-in",
                bgColor: "bg-blue-500",
                textColor: "text-white"
            },
            COMPLETED: {
                label: "Hoàn thành",
                bgColor: "bg-green-500",
                textColor: "text-white"
            },
        };

        return statusMap[status || "PENDING"] || statusMap.PENDING;
    };

    const statusInfo = getStatusInfo(status);

    return (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-lg font-semibold ${statusInfo.bgColor} ${statusInfo.textColor}`}>
            {statusInfo.label}
        </span>
    );
}
