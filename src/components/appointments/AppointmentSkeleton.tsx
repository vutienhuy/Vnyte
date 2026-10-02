
export default function AppointmentSkeleton() {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <div className="h-6 bg-gray-200 rounded w-32"></div>
                <div className="h-6 bg-gray-200 rounded-full w-24"></div>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl mb-4">
                <div className="h-5 bg-gray-200 rounded w-40 mb-3"></div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
            </div>

            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="h-16 bg-gray-200 rounded-xl"></div>
                <div className="h-16 bg-gray-200 rounded-xl"></div>
                <div className="h-16 bg-gray-200 rounded-xl"></div>
                <div className="h-16 bg-gray-200 rounded-xl"></div>
            </div>

            <div className="h-12 bg-gray-200 rounded-xl w-full"></div>
        </div>
    );
}
