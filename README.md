# מעקב מים וחשמל

אפליקציית ווב פשוטה למעקב אחר חשבונות מים וחשמל בדירה שכורה. שני משתמשים מתחברים כל אחד עם חשבון Google שלו, והנתונים מסתנכרנים בזמן אמת בין הטלפונים (Firebase Firestore).

**חשוב:** יש להשלים את שלבי ההגדרה למטה (חד-פעמי, בערך 10 דקות, בחינם) לפני שהאפליקציה תעבוד.

---

## שלב 1: יצירת פרויקט Firebase (חינמי)

1. כנסו ל-https://console.firebase.google.com והתחברו עם חשבון Google.
2. "Add project" → תנו שם (למשל `utility-tracker`) → אפשר לכבות Google Analytics (לא נדרש) → "Create project".

## שלב 2: הפעלת התחברות עם Google

1. בתפריט הצד: **Build → Authentication** → "Get started".
2. בלשונית "Sign-in method" → "Google" → הפעילו (Enable) → בחרו אימייל תמיכה → "Save".

## שלב 3: הפעלת Firestore (מסד הנתונים)

1. בתפריט הצד: **Build → Firestore Database** → "Create database".
2. בחרו מיקום קרוב (למשל `eur3` לאירופה) → מצב "Production mode" → "Enable".
3. בלשונית "Rules", מחקו את מה שיש שם, הדביקו את התוכן של הקובץ `firestore.rules` מהתיקייה הזו (אחרי שתערכו אותו - שלב 5), ולחצו "Publish".

## שלב 4: קבלת מפתחות החיבור (config)

1. בתפריט הצד, לחצו על גלגל השיניים ⚙️ ליד "Project Overview" → "Project settings".
2. גללו למטה ל"Your apps" → לחצו על סמל ה-web `</>`.
3. תנו שם לאפליקציה (למשל `web`) → "Register app". **לא** צריך Firebase Hosting.
4. תראו אובייקט קוד שנקרא `firebaseConfig` עם ערכים כמו `apiKey`, `authDomain` וכו'.

## שלב 5: עריכת שני הקבצים

1. פתחו את `firebase-config.js` בתיקייה הזו.
2. העתיקו לתוכו את הערכים האמיתיים מ-`firebaseConfig` ששלב 4 נתן לכם.
3. בשדה `allowedEmails`, כתבו את שני חשבונות ה-Gmail שלכם (שלך ושל השותף/ה) - רק הם יוכלו להתחבר.
4. פתחו את `firestore.rules`, ועדכנו את אותם שני האימיילים בדיוק (שני מקומות בקובץ הזה - `firebase-config.js` ו-`firestore.rules` - צריכים להיות תואמים).
5. חזרו לשלב 3.3 והדביקו את הגרסה המעודכנת של `firestore.rules` בקונסולת Firebase, ולחצו "Publish" (חשוב - זו ההגנה האמיתית, לא רק הרשימה שבתוך האפליקציה).

## שלב 6: העלאה ל-GitHub Pages

1. צרו ריפוזיטורי חדש ב-GitHub (אפשר גם פרטי - GitHub Pages תומך גם ב-repo פרטי אם יש לכם תוכנית בתשלום; אם הריפו ציבורי זה עובד גם בחינם. שימו לב: הקובץ `firebase-config.js` יהיה גלוי לכולם אם הריפו ציבורי - זה בסדר, הוא לא סוד, ההגנה האמיתית היא ב-Firestore Rules).
2. העלו את כל הקבצים מהתיקייה הזו לריפו (`index.html`, `app.js`, `firebase-config.js`, `manifest.json`, `icon.svg`).
3. ב-GitHub: Settings → Pages → תחת "Source" בחרו את ה-branch הראשי (`main`) ותיקיית `/root` → Save.
4. אחרי דקה-שתיים, GitHub ייתן לכם קישור כמו `https://your-username.github.io/utility-tracker/` - זה הקישור שתשתמשו בו משני הטלפונים.

## שלב 7: הפעלת מילוי אוטומטי מתמונה (Gemini)

זה מה שמאפשר להעלות תמונה של החשבון והשדות יתמלאו לבד. זה בחינם (Gemini Developer API, ללא צורך בכרטיס אשראי), אבל דורש שני שלבים נוספים:

1. **הפעלת AI Logic:** בתפריט הצד של Firebase Console: **Build → AI Logic** → "Get started" → כשנשאלים באיזה "Gemini API provider" להשתמש, בחרו **Gemini Developer API** (לא Vertex AI - זה הבחירה שלא דורשת חיוב). המשיכו את האשף עד הסוף.
2. **הפעלת App Check (הגנה על ה-API מפני שימוש לא מורשה):** האשף מהשלב הקודם בדרך כלל יפעיל את זה אוטומטית. אם לא: **Build → App Check → Apps** → מצאו את אפליקציית ה-web שלכם → "Register" → בחרו **reCAPTCHA v3** → Firebase ייתן לכם מפתח (site key), או שתוכלו ליצור אחד בעצמכם ב-https://www.google.com/recaptcha/admin.
3. העתיקו את מפתח ה-reCAPTCHA שקיבלתם לתוך `firebase-config.js`, לתוך `recaptchaSiteKey`.
4. שמרו, והעלו שוב את הקבצים המעודכנים ל-GitHub (שלב 6).

## שלב 8: הוספה נדרשת ב-Firebase - Authorized domains

1. חזרו ל-Firebase Console → Authentication → לשונית "Settings" → "Authorized domains".
2. לחצו "Add domain" והוסיפו את הדומיין של GitHub Pages שלכם (למשל `your-username.github.io`), אחרת ההתחברות עם Google תיכשל.

## שלב 9: שימוש

1. כל אחד פותח את הקישור מהטלפון שלו, לוחץ "התחברות עם Google", ומתחבר עם אחד משני החשבונות שהגדרתם.
2. אפשר להוסיף את הדף למסך הבית (בדפדפן: תפריט → "הוספה למסך הבית") כדי שזה יראה כמו אפליקציה רגילה.
3. כל שינוי (הוספה/עריכה/מחיקה של קריאה, כולל דרך תמונה) מופיע אצל שניכם כמעט מיידית.
4. ללחוץ על "📷 העלאת תמונה" כדי לצלם/להעלות את הפירוט מבעלת הדירה - השדות יתמלאו לבד. מומלץ תמיד לעבור על השורה החדשה (סמל ✎) ולוודא שהמספרים נקראו נכון, בייחוד אם כתב היד לא ברור.

---

### עלויות

Firebase Authentication, Firestore, App Check, ו-Gemini Developer API בהיקף שימוש כזה (כמה עשרות רשומות ותמונות בחודשיים) נמצאים בבירור בתוך המכסה החינמית (Spark plan) - לא אמורה להיות עלות כלשהי, וללא צורך בכרטיס אשראי.
