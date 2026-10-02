export default function UserInfo() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Thông tin người dùng</h1>
      <div className="w-full max-w-md bg-gray-100 rounded-lg p-6 mb-6">
        {/* User info placeholder */}
        <p className="text-gray-700">Tên: Nguyễn Văn A</p>
        <p className="text-gray-700">Mã bệnh nhân: 123456</p>
        <p className="text-gray-700">Ngày sinh: 01/01/1990</p>
      </div>
      <button className="px-6 py-2 bg-green-600 text-white rounded">In phiếu khám</button>
    </div>
  );
}
