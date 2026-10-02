"use client";

// Bước 1 — NVYT đăng nhập bằng tài khoản HIS ngay trên máy KIOSK.
//
// Hai ràng buộc chi phối màn này:
//   • Mật khẩu chỉ dùng một lần để gọi login, KHÔNG lưu lại dưới bất kỳ dạng nào (mục 9).
//     Tên đăng nhập thì được nhớ — tài liệu chỉ cấm lưu mật khẩu.
//   • Máy ở sảnh không có bàn phím vật lý và Windows không chắc tự bật bàn phím cảm ứng,
//     nên ô nhập tự mở bàn phím ảo; máy có bàn phím rời vẫn gõ thẳng được (xem TouchField).

import { useEffect, useState } from "react";
import TouchField from "@/components/assisted/TouchField";
import { Card, PageHead, PrimaryButton } from "@/components/assisted/FlowShell";
import { ArError, staffLogin } from "@/services/assisted-reception.service";
import { getArError } from "@/constants/assisted-reception-errors";

const LAST_LOGIN_KEY = "arLastStaffLogin";

interface Props {
  onSuccess: (staffName: string, idleTimeoutSeconds: number) => void;
  /** Thông báo mang sang từ phiên trước (hết giờ chờ, bị đăng nhập đè…). */
  notice?: string | null;
}

export default function StaffLoginPanel({ onSuccess, notice }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bị khoá đăng nhập (429) → chặn nút tại chỗ, bấm thêm chỉ khoá lâu hơn. */
  const [locked, setLocked] = useState(false);

  // Nhớ tên đăng nhập của NVYT trực gần nhất: mỗi ca một người đứng máy, gõ lại
  // tài khoản cho từng lần đăng nhập là thừa.
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_LOGIN_KEY);
      if (last) setUsername(last);
    } catch { /* localStorage bị chặn — bỏ qua, chỉ là tiện ích */ }
  }, []);

  const submit = async () => {
    if (loading || locked || !username.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await staffLogin(username.trim(), password);
      setPassword("");
      try { localStorage.setItem(LAST_LOGIN_KEY, username.trim()); } catch { /* bỏ qua */ }
      onSuccess(res.staff?.userName || res.staff?.loginName || username, res.idleTimeoutSeconds);
    } catch (e) {
      const err = e as ArError;
      const info = getArError(err.code);
      setError(info.preferServerMessage && err.message ? err.message : info.message);
      if (err.code === "KIOSK_STAFF_LOGIN_LOCKED") setLocked(true);
      setPassword(""); // sai lần nào xoá lần đó, không để mật khẩu nằm lại trên màn
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && !locked && !!username.trim() && !!password;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <PageHead
        title="Tiếp đón có hỗ trợ"
        subtitle="Nhân viên y tế đăng nhập tài khoản HIS để bắt đầu"
      />

      {notice && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 text-xl">
          {notice}
        </div>
      )}

      <Card className="space-y-5">
        <TouchField
          label="Tài khoản HIS"
          value={username}
          onChange={setUsername}
          placeholder="Tên đăng nhập"
        />

        <TouchField
          label="Mật khẩu"
          mask
          value={password}
          onChange={setPassword}
          placeholder="Mật khẩu HIS"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3 text-xl">
            {error}
          </div>
        )}

        <PrimaryButton onClick={submit} disabled={!canSubmit} className="w-full">
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </PrimaryButton>
      </Card>
    </div>
  );
}
