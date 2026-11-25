# ---- אימג' ה-Web: Nginx שמגיש את לוח הבקרה הסטטי ומשמש reverse proxy ל-API ----
# אימג' בסיס: Nginx 1.27 על Alpine Linux (קטן וקל משקל)
FROM nginx:1.27-alpine

# מוחקים את קובץ ההגדרות של אתר ברירת המחדל של Nginx
RUN rm /etc/nginx/conf.d/default.conf
# מעתיקים את קובץ ההגדרות שלנו במקומו
COPY nginx.conf /etc/nginx/conf.d/parking.conf

# מעתיקים את הקבצים הסטטיים של לוח הבקרה (HTML, כל קבצי ה-CSS וה-JS) לתיקייה ש-Nginx מגיש
COPY index.html *.css *.js /usr/share/nginx/html/

# תיעוד: Nginx מאזין לפורט 80 בתוך הקונטיינר
EXPOSE 80

# בדיקת בריאות: כל 10 שניות, מחכים עד 3 שניות, 3 כישלונות ברצף = unhealthy
# פונים לנתיב /healthz של Nginx עצמו עם wget; אם נכשל מחזירים קוד 1
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1
