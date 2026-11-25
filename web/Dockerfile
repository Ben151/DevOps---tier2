# ---- Web image: Nginx serving the static dashboard + reverse proxy to the API ----
FROM nginx:1.27-alpine

# replace the default site config with ours
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/parking.conf

# static files of the dashboard
COPY index.html *.css *.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1
