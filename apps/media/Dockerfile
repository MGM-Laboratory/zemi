FROM bluenviron/mediamtx:1.21.1 AS mediamtx

FROM alpine:3.22
RUN apk add --no-cache curl ca-certificates tzdata
COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx
COPY mediamtx.yml /zemi/mediamtx.yml
COPY scripts/ /zemi/
RUN chmod +x /zemi/*.sh && mkdir -p /recordings
ENV TZ=UTC
EXPOSE 1935 8888 9997
ENTRYPOINT ["/zemi/entrypoint.sh"]
