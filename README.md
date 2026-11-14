# Demo Motif

هذي سكرين شوت من تصميم التطبيق حقي ابيك تحوله الى شي حقيقي لكن بدون حفظ و بدون تسجيل دخول 

وش فكرته؟
هو تطبيق يساعدك تسوي ايديت بالذكاء الاصطناعي حسب الستايل او البراند او التصميم الي انت تبيه او الـ system design الي انت تبيه 

يحل اكبر مشكلة تواجه الناس الي يسوو الاديت ب claude & chatgpt و هي انه ما يعرف وش يبغو او وش تصميمهم و يطلع خايس و ثانيا التكرار بدل ما كل شوي تعطيه الريفرينس خلاص مرة واحدة بدون اي اسئلة و الخ 

هذي صور سكرين شوتس حولها الى تطبيق حقيقي لكن بدون حفظ او داتا و بدون تسجيل دخول او جديد

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
cp .env.example .env   # then put your OpenAI API key in .env
npm run dev            # http://localhost:8080
```

The two AI features, edit plans and style extraction, call the OpenAI API from the server and
need `OPENAI_API_KEY`. Without a key the app still runs and those two features show an error.
