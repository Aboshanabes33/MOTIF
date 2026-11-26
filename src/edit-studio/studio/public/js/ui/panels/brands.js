import{h as c}from"../dom.js";
import{dialog as dialog}from"../dialog.js";
import{globalApi as api}from"../../net.js";

const brandKey="mohrer.brands";
const en=()=>document.documentElement.lang==="en";
const text=(ar,enText)=>en()?enText:ar;
const uid=()=>`brand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

async function prefs(){
 const r=await fetch(api("/api/prefs"),{cache:"no-store"});
 if(!r.ok)throw new Error("Could not load preferences");
 return r.json();
}

async function savePrefs(next){
 const r=await fetch(api("/api/prefs"),{
  method:"PUT",
  headers:{"content-type":"application/json"},
  body:JSON.stringify(next)
 });
 if(!r.ok)throw new Error("Could not save preferences");
 return r.json();
}

async function openBrandEditor(existing=null){
 let logo=existing?.logo||"";
 const name=c("input",{type:"text",class:"field brand-field",value:existing?.name||"",maxlength:"80",placeholder:text("اسم العلامة التجارية","Brand name"),"aria-label":text("اسم العلامة التجارية","Brand name")});
 const tagline=c("input",{type:"text",class:"field brand-field",value:existing?.tagline||"",maxlength:"160",placeholder:text("الشعار أو الجملة المختصرة","Tagline or short promise"),"aria-label":text("الشعار","Tagline")});
 const audience=c("textarea",{class:"field brand-field brand-textarea",rows:"3",maxlength:"500",placeholder:text("الجمهور المستهدف، الاهتمامات والسوق","Target audience, interests and market"),"aria-label":text("الجمهور","Audience")},existing?.audience||"");
 const voice=c("textarea",{class:"field brand-field brand-textarea",rows:"3",maxlength:"500",placeholder:text("نبرة الصوت والأسلوب والكلمات التي تجنبها","Voice, writing style and words to avoid"),"aria-label":text("الصوت والأسلوب","Brand voice")});
 voice.value=existing?.voice||"";
 const channels=c("input",{type:"text",class:"field brand-field",value:existing?.channels||"",maxlength:"240",placeholder:text("Instagram، TikTok، YouTube","Instagram, TikTok, YouTube"),"aria-label":text("القنوات","Channels")});
 const notes=c("textarea",{class:"field brand-field brand-textarea",rows:"3",maxlength:"1000",placeholder:text("معلومات إضافية واتجاهات التصميم","Additional brand and design guidelines"),"aria-label":text("معلومات إضافية","Additional notes")});
 notes.value=existing?.notes||"";
 const file=c("input",{type:"file",class:"brand-file",accept:"image/png,image/jpeg,image/webp,image/svg+xml","aria-label":text("شعار العلامة","Brand logo")});
 const preview=c("div",{class:"brand-logo-preview"},existing?.logo?c("img",{src:existing.logo,alt:""}):c("span",null,text("بدون شعار","No logo")));
 file.addEventListener("change",()=>{
  const picked=file.files&&file.files[0];
  if(!picked)return;
  if(picked.size>2*1024*1024){file.value="";preview.replaceChildren(c("span",null,text("الحد الأقصى 2 ميجابايت","Maximum size: 2 MB")));return;}
  const reader=new FileReader();
  reader.onload=()=>{logo=String(reader.result||"");preview.replaceChildren(c("img",{src:logo,alt:""}));};
  reader.readAsDataURL(picked);
 });
 const colorInputs=[];
 const swatches=c("div",{class:"brand-color-grid"});
 const initial=Array.isArray(existing?.colors)?existing.colors:["#9FD8CD","#2F7268","#EEF5F3","#E9A23B"];
 for(let i=0;i<4;i++){
  const input=c("input",{type:"color",class:"brand-color",value:/^#[0-9a-f]{6}$/i.test(initial[i])?initial[i]:"#9FD8CD","aria-label":text(`لون العلامة ${i+1}`,`Brand color ${i+1}`)});
  colorInputs.push(input);
  swatches.append(c("label",{class:"brand-color-label"},input,c("span",null,input.value)));
  input.addEventListener("change",()=>input.nextElementSibling.textContent=input.value);
 }
 const form=c("div",{class:"brand-editor"},
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("اسم العلامة","Brand name")),name),
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("الشعار","Tagline")),tagline),
  c("div",{class:"brand-form-row"},c("span",{class:"raw-label"},text("الشعار أو اللوجو","Logo")),c("div",{class:"brand-logo-row"},preview,file)),
  c("div",{class:"brand-form-row"},c("span",{class:"raw-label"},text("الألوان","Brand colors")),swatches),
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("الجمهور","Audience")),audience),
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("الصوت والأسلوب","Brand voice")),voice),
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("القنوات","Channels")),channels),
  c("label",{class:"brand-form-row"},c("span",{class:"raw-label"},text("ملاحظات","Notes")),notes)
 );
 const result=await dialog({
  title:text(existing?"تعديل العلامة التجارية":"إضافة علامة تجارية",existing?"Edit brand":"Add brand"),
  content:form,
  wide:true,
  primary:{label:text(existing?"حفظ التغييرات":"إضافة العلامة",existing?"Save changes":"Add brand")},
  secondary:{label:text("إلغاء","Cancel")}
 });
 if(result!=="primary")return null;
 const brandName=name.value.trim();
 if(!brandName)return null;
 return {
  id:existing?.id||uid(),
  name:brandName,
  tagline:tagline.value.trim(),
  logo,
  colors:colorInputs.map(v=>v.value),
  audience:audience.value.trim(),
  voice:voice.value.trim(),
  channels:channels.value.trim(),
  notes:notes.value.trim()
 };
}

export function mountBrands(container,ctx){
 const root=c("section",{class:"brand-section"});
 const head=c("div",{class:"brand-section-head"},
  c("div",null,c("h2",null,text("العلامات التجارية","Brands")),c("p",null,text("هوية تستخدمها في المقاطع والمشاريع","Reusable identity for projects and exports"))),
  c("button",{type:"button",class:"brand-add"},text("إضافة علامة","+ Brand"))
 );
 const list=c("div",{class:"brand-list"});
 root.append(head,list);
 container.prepend(root);
 let brands=[];
 let prefsCache=null;

 async function refresh(){
  try{
   prefsCache=await prefs();
   brands=Array.isArray(prefsCache.brands)?prefsCache.brands:[];
  }catch{
   brands=[];
  }
  render();
 }

 function render(){
  list.replaceChildren();
  if(!brands.length){
   list.append(c("div",{class:"brand-empty"},text("أضف علامتك التجارية لتوحيد الألوان والشعار والجمهور.","Add a brand to keep colors, logo and audience consistent.")));
   return;
  }
  for(const brand of brands){
   const swatches=c("div",{class:"brand-card-swatches"});
   for(const color of (brand.colors||[]).slice(0,4))swatches.append(c("span",{style:`--swatch:${color}`}));
   const card=c("article",{class:"brand-card"},
    c("div",{class:"brand-card-logo"},brand.logo?c("img",{src:brand.logo,alt:""}):c("span",null,(brand.name||"?").slice(0,1).toUpperCase())),
    c("div",{class:"brand-card-info"},c("strong",null,brand.name),brand.tagline?c("span",null,brand.tagline):null,swatches),
    c("button",{type:"button",class:"brand-card-edit","aria-label":text("تعديل","Edit")},text("تعديل","Edit"))
   );
   card.querySelector(".brand-card-edit").addEventListener("click",()=>openBrandEditor(brand).then(async next=>{
    if(!next)return;
    const nextBrands=brands.map(v=>v.id===next.id?next:v);
    prefsCache.brands=nextBrands;
    await savePrefs(prefsCache);
    brands=nextBrands;
    render();
   }).catch(()=>{}));
   list.append(card);
  }
 }

 head.querySelector(".brand-add").addEventListener("click",()=>openBrandEditor().then(async brand=>{
  if(!brand)return;
  prefsCache=prefsCache||await prefs();
  brands=[...brands,brand];
  prefsCache.brands=brands;
  await savePrefs(prefsCache);
  render();
 }).catch(()=>{}));

 refresh();
 return {el:root,refresh,destroy(){root.remove()}};
}
