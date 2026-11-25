# ---- אימג' ה-API: Node.js + Express ----
# אימג' בסיס: Node 22 על Alpine Linux (קטן וקל משקל)
FROM node:22-alpine

# מצב production: Express רץ מהר יותר ו-npm מדלג על תלויות פיתוח
ENV NODE_ENV=production

# תיקיית העבודה בתוך הקונטיינר - כל הפקודות הבאות רצות ממנה
WORKDIR /app

# מעתיקים קודם רק את קבצי ה-package -> שכבת ה-npm ci נשמרת ב-cache כל עוד התלויות לא משתנות
COPY package.json package-lock.json ./
# התקנה מדויקת לפי ה-lock בלי תלויות פיתוח, ואז ניקוי ה-cache של npm כדי להקטין את האימג'
RUN npm ci --omit=dev && npm cache clean --force

# מעתיקים את קוד השרת (אחרי התלויות, כך ששינוי בקוד לא שובר את ה-cache של ההתקנה)
COPY server.js .

# מריצים כמשתמש שאינו root - באימג' הרשמי של node כבר קיים משתמש בשם "node"
USER node

# תיעוד: השרת מאזין לפורט 3000 בתוך הקונטיינר
EXPOSE 3000

# בדיקת בריאות: כל 10 שניות, מחכים עד 3 שניות לתשובה, 3 כישלונות ברצף = unhealthy
# משתמשים ב-wget שמגיע עם alpine (busybox) - אין צורך להתקין curl; אם הבקשה נכשלת מחזירים קוד 1
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# מריצים את node ישירות (ולא "npm start") כדי ש-node יקבל את ה-SIGTERM מ-Docker
CMD ["node", "server.js"]
