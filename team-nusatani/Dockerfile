# Alternative to the host nginx: a tiny static container (e.g. behind Caddy/Traefik on server7)
#   docker build -t team-nusatani . && docker run -d --restart unless-stopped -p 127.0.0.1:8088:80 team-nusatani
FROM nginx:1.27-alpine
COPY deploy/docker-nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html
