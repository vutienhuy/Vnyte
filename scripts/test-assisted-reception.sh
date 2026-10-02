#!/usr/bin/env bash
# Chạy thử end-to-end luồng "Tiếp đón có hỗ trợ" (đăng ký khám BHYT) qua Gateway VNT.
#
# Dùng để nghiệm thu nhanh mà không cần mở app kiosk: đi đúng thứ tự API trong
# tich-hop-kiosk-tiep-don-co-ho-tro.md mục 5 và dừng lại ở bước đầu tiên lỗi.
#
#   BASE   — gốc theo viện, vd http://192.168.1.203:5001/api/hospitals/01816 (dev)
#            hoặc https://vntgw.onelink.vn/api/hospitals/01816 (prod)
#   DC/DS  — cặp device code/secret của máy kiosk (lấy khi activate license)
#   USER/PASS — tài khoản HIS của NVYT (phải có quyền kiosk-assisted-reception:create)
#   CCCD/NAME/DOB/GENDER — thẻ của bệnh nhân đem ra thử
#
# KHÔNG chạy bước register trừ khi truyền REGISTER=1: bước đó TẠO HỒ SƠ THẬT trên HIS.
#
# Ví dụ:
#   BASE=http://192.168.1.203:5001/api/hospitals/01816 DC=KIOSK-A02 DS=... \
#   USER=030097012870 PASS='...' CCCD=030097012870 NAME='VU TIEN HUY' DOB=1997-01-01 \
#   bash scripts/test-assisted-reception.sh

set -u

BASE="${BASE:?thiếu BASE}"
DC="${DC:?thiếu DC}"
DS="${DS:?thiếu DS}"
USER="${USER:?thiếu USER}"
PASS="${PASS:?thiếu PASS}"
CCCD="${CCCD:-}"
NAME="${NAME:-}"
DOB="${DOB:-}"
GENDER="${GENDER:-MALE}"
REGISTER="${REGISTER:-0}"

# Thư mục tạm đặt NGAY TRONG thư mục hiện tại, không dùng mktemp -d: trên Git Bash
# (Windows) `/tmp` của bash và `%TMP%` mà node nhìn thấy có thể là hai chỗ khác nhau,
# curl ghi được file mà node đọc lại báo ENOENT.
TMP="$PWD/.ar-test-tmp"
mkdir -p "$TMP"
# node là chương trình Windows, không hiểu đường dẫn kiểu MSYS (/f/...) → đổi sang
# dạng Windows cho mọi chỗ node đọc/ghi file. bash vẫn dùng $TMP như thường.
TMPW="$(cd "$TMP" && pwd -W 2>/dev/null || echo "$TMP")"
trap 'rm -rf "$TMP"' EXIT
TOKEN=""

# In gọn: tên bước, HTTP code, rồi 400 ký tự đầu của body.
call() {
  local label="$1" method="$2" url="$3" body="${4:-}"
  local args=(-s -m 120 -o "$TMP/out.json" -w "%{http_code}"
    -H "Content-Type: application/json"
    -H "X-Kiosk-Device-Code: $DC" -H "X-Kiosk-Device-Secret: $DS")
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(-d "$body")
  local code
  code="$(curl "${args[@]}" -X "$method" "$url")"
  printf '\n=== %s → HTTP %s\n' "$label" "$code"
  head -c 400 "$TMP/out.json"; echo
  [ "${code:0:1}" = "2" ] || { echo "DỪNG: bước '$label' lỗi."; exit 1; }
}

# jq không có sẵn trên mọi máy kiosk → lấy trường bằng node (đã có sẵn cùng app).
field() { node -e "
const fs=require('fs');const d=JSON.parse(fs.readFileSync('$TMPW/out.json','utf8'));
const path='$1'.split('.');let v=d;for(const k of path){v=v?.[k];}
process.stdout.write(v==null?'':String(v));"; }

call "1. login" POST "$BASE/kiosk-staff-session/login" "{\"username\":\"$USER\",\"password\":\"$PASS\"}"
TOKEN="$(field data.accessToken)"
[ -n "$TOKEN" ] || { echo "DỪNG: không lấy được accessToken."; exit 1; }
echo "NVYT: $(field data.staff.userName) | idleTimeout=$(field data.idleTimeoutSeconds)s"

call "2. catalog/patient-types" GET "$BASE/kiosk-assisted-reception/catalog/patient-types"
call "3. catalog/hein-patient-types" GET "$BASE/kiosk-assisted-reception/catalog/hein-patient-types"

if [ -n "$CCCD" ] && [ -n "$NAME" ] && [ -n "$DOB" ]; then
  call "4. lookup" POST "$BASE/kiosk-assisted-reception/lookup" \
    "{\"identityNumber\":\"$CCCD\",\"fullName\":\"$NAME\",\"dob\":\"$DOB\",\"gender\":\"$GENDER\"}"
  RID="$(field data.receptionId)"
  echo "receptionId=$RID"

  call "5. patient-info (GET)" GET "$BASE/kiosk-assisted-reception/$RID/patient-info"
  # Xác nhận hành chính: gửi lại nguyên phiếu vừa đọc (kể cả 4 trường khoá).
  node -e "
    const fs=require('fs');const d=JSON.parse(fs.readFileSync('$TMPW/out.json','utf8'));
    fs.writeFileSync('$TMPW/info.json', JSON.stringify(d.data.patientInfo));"
  call "6. patient-info (PUT)" PUT "$BASE/kiosk-assisted-reception/$RID/patient-info" "$(cat "$TMP/info.json")"

  call "7. insurance-check" POST "$BASE/kiosk-assisted-reception/$RID/insurance-check" "{}"
  call "8. catalog/follow-ups" GET "$BASE/kiosk-assisted-reception/catalog/follow-ups?receptionId=$RID"
  call "9. rooms (BHYT patientTypeId=1)" GET "$BASE/kiosk-assisted-reception/$RID/rooms?patientTypeId=1"
  ROOM="$(field data.0.roomId)"
  if [ -n "$ROOM" ]; then
    call "10. services phòng $ROOM" GET "$BASE/kiosk-assisted-reception/$RID/services?roomId=$ROOM&patientTypeId=1"
    SVC="$(field data.items.0.serviceId)"
  fi

  if [ "$REGISTER" = "1" ] && [ -n "${SVC:-}" ]; then
    echo "!!! register TẠO HỒ SƠ THẬT trên HIS"
    call "11. register" POST "$BASE/kiosk-assisted-reception/$RID/register" \
      "{\"patientTypeId\":1,\"roomId\":$ROOM,\"serviceId\":$SVC,\"heinPatientTypeCode\":\"1.1\",\"symptom\":\"Chạy thử tiếp đón KIOSK\"}"
    call "12. ticket" GET "$BASE/kiosk-assisted-reception/$RID/ticket"
  else
    echo "(bỏ qua register — đặt REGISTER=1 nếu thật sự muốn tạo hồ sơ HIS)"
    call "11. cancel phiếu nháp" POST "$BASE/kiosk-assisted-reception/$RID/cancel" "{}"
  fi
fi

call "cuối. logout" POST "$BASE/kiosk-staff-session/logout" "{}"
echo; echo "Xong."
