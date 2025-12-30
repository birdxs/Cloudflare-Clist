-- 添加游客权限字段到存储表
ALTER TABLE storages ADD COLUMN guest_list INTEGER DEFAULT 1;
ALTER TABLE storages ADD COLUMN guest_download INTEGER DEFAULT 1;
ALTER TABLE storages ADD COLUMN guest_upload INTEGER DEFAULT 0;

-- 根据现有 is_public 字段初始化权限
UPDATE storages SET guest_list = is_public, guest_download = is_public WHERE guest_list IS NULL;
