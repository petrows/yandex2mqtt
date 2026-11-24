# Локальная установка и запуск

## Запуск приложения напрямую

Настройка репозитория Node JS (нужен Node.js 26 или новее, опционально - можно использовать репозитории вашего дистрибутива, если версия подходит):

```bash
curl -sL https://deb.nodesource.com/setup_26.x | bash -
```

Устанавка необходимых пакетов:

```bash
sudo apt-get install -y nodejs git make g++ gcc build-essential
```

Копирование файлов y2m с git:

```bash
git clone https://github.com/petrows/yandex2mqtt.git /opt/yandex2mqtt
```

Установка прав на директорию:

```bash
chown -R root:root /opt/yandex2mqtt
```

Установка необходимых модулей nodejs:

```bash
cd /opt/yandex2mqtt
npm install
```

Запуск моста (выполняется после настройки):

```bash
export DEBUG=*
node app.js --log debug
```

## Создание службы
В папке `/etc/systemd/system/` создать файл `yandex2mqtt.service` со следующим содержанем:
```conf
[Unit]
Description=yandex2mqtt
After=network.target

[Service]
ExecStart=/usr/bin/node app.js --log debug
WorkingDirectory=/opt/yandex2mqtt
StandardOutput=inherit
StandardError=inherit
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```

Для включения службы использовать команду:
```bash
systemctl enable yandex2mqtt.service
```

Для управления службой использовать команды:
```bash
service yandex2mqtt start
```
```bash
service yandex2mqtt stop
```
```bash
service yandex2mqtt restart
```
