# Demo Motif

هذي سكرين شوت من تصميم التطبيق حقي ابيك تحوله الى شي حقيقي لكن بدون حفظ و بدون تسجيل دخول 

وش فكرته؟
هو تطبيق يساعدك تسوي ايديت بالذكاء الاصطناعي حسب الستايل او البراند او التصميم الي انت تبيه او الـ system design الي انت تبيه 

يحل اكبر مشكلة تواجه الناس الي يسوو الاديت ب claude & chatgpt و هي انه ما يعرف وش يبغو او وش تصميمهم و يطلع خايس و ثانيا التكرار بدل ما كل شوي تعطيه الريفرينس خلاص مرة واحدة بدون اي اسئلة و الخ 

هذي صور سكرين شوتس حولها الى تطبيق حقيقي لكن بدون حفظ او داتا و بدون تسجيل دخول او جديد

## Development

You need Node.js 22.19 or later and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev            # http://localhost:8080
```

When the app opens it asks you to link an AI account: sign in with a ChatGPT subscription, or
paste an API key from OpenCode or OpenAI. The two AI features, edit plans and style extraction,
run on that account. Without one the app still runs and those two features ask you to link.

The link is kept in the server's memory. Restarting the server forgets it, and you link again.

Sign in with ChatGPT finishes by itself when your browser and the server are on the same
computer. When they are not, the last page of the sign-in fails to load: copy its address from
the address bar and paste it into the pop-up.

To run the production build, use `npm run build` and then `node .output/server/index.mjs`.
