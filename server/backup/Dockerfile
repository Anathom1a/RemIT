# Резервное копирование RemIT: pg_dump/pg_restore той же версии, что и база,
# плюс curl (загрузка в S3 с подписью AWS SigV4) и openssl (шифрование).
FROM postgres:16-alpine
RUN apk add --no-cache curl openssl tzdata
COPY backup.sh /usr/local/bin/remit-backup
RUN chmod +x /usr/local/bin/remit-backup
ENTRYPOINT ["remit-backup"]
CMD ["loop"]
