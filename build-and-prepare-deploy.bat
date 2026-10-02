
@echo off
REM Build Next.js app and prepare deploy folder for Docker
REM 1. Build on local machine
REM 2. Copy deploy folder sang máy Docker

REM Cài đặt dependencies và build project
REM Phải dùng `call` khi gọi npm.cmd, ngược lại control transfer và script dừng giữa chừng.
echo Installing dependencies...
call npm install
if errorlevel 1 goto :fail
echo Building project...
call npm run build
if errorlevel 1 goto :fail

REM Xóa thư mục deploy nếu đã tồn tại
if exist deploy rmdir /S /Q deploy
mkdir deploy
mkdir deploy\.next
mkdir deploy\public

REM Copy build output và các file cấu hình cần thiết
xcopy /E /I /Y .next deploy\.next
xcopy /E /I /Y public deploy\public
copy package.json deploy\
if exist package-lock.json copy package-lock.json deploy\
if exist next.config.js copy next.config.js deploy\
if exist next.config.ts copy next.config.ts deploy\
if exist .env.production copy .env.production deploy\
if exist Dockerfile copy Dockerfile deploy\
if exist docker-compose.yml copy docker-compose.yml deploy\
if exist web.config copy web.config deploy\

@echo --------------------------------------
@echo Deploy folder is ready in ./deploy
@echo Copy the deploy folder to your Docker host, then run:
@echo    docker compose up -d
@echo --------------------------------------
goto :eof

:fail
@echo --------------------------------------
@echo BUILD FAILED. Xem lỗi phía trên.
@echo --------------------------------------
exit /b 1
