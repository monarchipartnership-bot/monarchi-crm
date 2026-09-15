// Image Studio canvas engine — ported from portfolio_studio.html's inline
// <script> (templates, palette presets, PNG/JPEG export, drag&drop,
// localStorage autosave). Canvas drawing math is untouched; the outer
// wrapper is an exported init function so React can call it after the DOM
// (matching element ids) is mounted, and clean up its resize listener on
// unmount. Templates are grouped per format (Upwork Project Catalog /
// Upwork Portfolio) and only shown once a format is picked.
export function initImageStudio(exportCallback) {
  const KEY="monarchi_studio_v2";
  const $=id=>document.getElementById(id);
  const onExport=typeof exportCallback==="function"?exportCallback:null;

  function goBack(){ if(history.length>1){ history.back(); } else { location.href='index.html'; } }
  window.goBack = goBack;

  /* === Monarchi logo (embedded SVG) ===
     The wordmark is recolored to white for legibility on dark backgrounds,
     while the badge keeps the brand plum disc with the white "M" mark. */
  let brandImg=null;
  const RAW_SVG=`<svg width="186" height="40" viewBox="0 0 186 40" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Group"><g id="Group_2"><path id="Vector" d="M72.0708 10.7094C71.746 9.27188 69.7782 9.07813 69.1785 10.4234L64.5434 20.8188C64.4825 20.9672 64.3888 21.1797 64.2654 21.4516C63.9031 22.2578 63.6142 22.9531 63.4034 23.5359C63.3487 23.6875 63.1363 23.6844 63.0785 23.5344C62.8521 22.9375 62.6538 22.4219 62.4867 21.9906C62.2743 21.4516 62.1181 21.0672 62.015 20.8344L57.2503 10.3828C56.6397 9.04532 54.6797 9.25157 54.3611 10.6875L50.0103 30.3609H53.3913L55.8135 18.9531C55.9463 18.3719 56.0462 17.8141 56.1165 17.2813C56.1836 16.7516 56.2196 16.2422 56.2321 15.7547C56.3648 16.2297 56.5225 16.7109 56.7006 17.1969C56.8817 17.6813 57.0941 18.1813 57.3424 18.6984L63.0973 30.9656C63.1582 31.0969 63.3456 31.0969 63.4081 30.9656L69.1598 18.9516C69.4175 18.4031 69.6314 17.8641 69.8017 17.3375C69.9719 16.8109 70.1015 16.2844 70.1952 15.7531C70.2561 16.1984 70.3279 16.7563 70.4107 17.4313C70.5044 18.2422 70.5716 18.7391 70.6137 18.9188L73.1109 30.3594H76.5216L72.0755 10.7078L72.0708 10.7094Z" fill="#421342"/><path id="Vector_2" d="M92.1699 20.8281C91.8248 19.9906 91.3172 19.2375 90.6519 18.5734C89.9851 17.8984 89.2323 17.3891 88.3937 17.0438C87.5551 16.6984 86.6587 16.5234 85.7092 16.5234C84.7596 16.5234 83.9007 16.6984 83.0558 17.0438C82.2141 17.3891 81.466 17.8859 80.8179 18.5313C80.162 19.1875 79.6576 19.9375 79.3078 20.7797C78.9548 21.6219 78.7799 22.5156 78.7799 23.4625C78.7799 24.4094 78.9517 25.3031 79.3 26.1406C79.6482 26.9797 80.1526 27.7359 80.8179 28.4109C81.477 29.075 82.2266 29.5828 83.0714 29.9328C83.9132 30.2828 84.794 30.4578 85.7092 30.4578C86.6243 30.4578 87.5285 30.2828 88.3734 29.9328C89.2183 29.5828 89.9867 29.0641 90.6785 28.3813C91.3375 27.7359 91.8357 26.9922 92.1793 26.1562C92.5197 25.3172 92.6915 24.4203 92.6915 23.4625C92.6915 22.5047 92.5197 21.6656 92.1715 20.8266L92.1699 20.8281ZM88.4999 26.5484C87.7394 27.3797 86.8195 27.7984 85.7341 27.7984C84.6488 27.7984 83.7289 27.3797 82.9684 26.5484C82.211 25.7141 81.8283 24.6969 81.8283 23.4937C81.8283 22.2906 82.2094 21.2734 82.9684 20.4391C83.7289 19.6047 84.6488 19.1891 85.7341 19.1891C86.8195 19.1891 87.7487 19.6047 88.5046 20.4391C89.2605 21.2734 89.6384 22.2906 89.6384 23.4937C89.6384 24.6969 89.2573 25.7141 88.4983 26.5484H88.4999Z" fill="#421342"/><path id="Vector_3" d="M108.755 20.1157C108.655 19.6423 108.496 19.2267 108.274 18.8704C107.902 18.2688 107.385 17.8157 106.722 17.511C106.061 17.2079 105.26 17.0532 104.317 17.0532C103.199 17.0532 102.249 17.2595 101.468 17.6673C100.684 18.0782 100.005 18.7298 99.4286 19.6235V17.6532C99.4286 17.572 99.363 17.5048 99.2803 17.5048H96.8581C96.7769 17.5048 96.7097 17.5704 96.7097 17.6532V30.4579H99.6004V24.5548C99.6004 23.4876 99.6426 22.711 99.7254 22.2251C99.8112 21.736 99.9612 21.3392 100.172 21.0298C100.475 20.5642 100.889 20.2032 101.418 19.9501C101.946 19.6938 102.547 19.5688 103.222 19.5688C104.254 19.5688 104.971 19.8485 105.376 20.4079C105.778 20.9673 105.982 22.1001 105.982 23.8032V30.4595H108.899V22.6001C108.899 21.4173 108.849 20.5892 108.752 20.1157H108.755Z" fill="#421342"/><path id="Vector_4" d="M147.657 17.2063C147.262 17.1047 146.859 17.0547 146.451 17.0547C145.695 17.0547 145.063 17.2609 144.551 17.6688C144.042 18.0797 143.631 18.7125 143.32 19.5703V17.6266C143.32 17.5453 143.255 17.4781 143.172 17.4781H140.578C140.497 17.4781 140.429 17.5438 140.429 17.6266V30.4609H143.32V24.775C143.32 22.9188 143.529 21.5953 143.945 20.8047C144.363 20.0172 145.051 19.625 146.009 19.625C146.365 19.625 146.689 19.6672 146.976 19.7531C147.263 19.8391 147.534 19.975 147.782 20.1563L148.822 17.6422C148.441 17.4516 148.051 17.3047 147.655 17.2047L147.657 17.2063Z" fill="#421342"/><path id="Vector_5" d="M157.399 19.1203C158.084 19.1203 158.722 19.2531 159.312 19.5156C159.902 19.7828 160.418 20.1641 160.863 20.6641V17.4203C160.863 17.3656 160.833 17.3141 160.785 17.2875C160.329 17.0344 159.84 16.8484 159.317 16.7219C158.765 16.5906 158.161 16.5234 157.505 16.5234C155.417 16.5234 153.727 17.1641 152.434 18.4437C151.143 19.725 150.498 21.4062 150.498 23.4937C150.498 25.5812 151.119 27.2281 152.369 28.5203C153.615 29.8156 155.231 30.4609 157.213 30.4609C157.895 30.4609 158.544 30.3844 159.149 30.2313C159.73 30.0813 160.277 29.8656 160.786 29.5766C160.833 29.55 160.861 29.5 160.861 29.4453V26.1172C160.446 26.6641 159.962 27.0719 159.41 27.3406C158.859 27.6078 158.234 27.7437 157.532 27.7437C156.271 27.7437 155.281 27.3594 154.567 26.5875C153.851 25.8188 153.496 24.7594 153.496 23.4094C153.496 22.0594 153.849 21.0797 154.56 20.2953C155.27 19.5141 156.217 19.1203 157.399 19.1203Z" fill="#421342"/><path id="Vector_6" d="M176.823 20.1159C176.723 19.6425 176.564 19.2269 176.342 18.8706C175.969 18.269 175.451 17.8159 174.79 17.5112C174.129 17.2081 173.327 17.0534 172.385 17.0534C171.267 17.0534 170.314 17.2597 169.533 17.6675C168.752 18.0784 168.072 18.73 167.494 19.6237V9.42529C167.494 9.34404 167.428 9.27686 167.345 9.27686H164.923C164.842 9.27686 164.775 9.34248 164.775 9.42529V30.4581H167.669V24.555C167.669 23.4878 167.711 22.7112 167.794 22.2253C167.878 21.7362 168.026 21.3394 168.24 21.03C168.54 20.5644 168.957 20.2034 169.485 19.9503C170.016 19.694 170.617 19.569 171.292 19.569C172.321 19.569 173.041 19.8487 173.444 20.4081C173.848 20.9675 174.05 22.1003 174.05 23.8034V30.4597H176.97V22.6003C176.97 21.4175 176.92 20.5894 176.823 20.1159Z" fill="#421342"/><path id="Vector_7" d="M181.907 17.6549V30.4596H184.797V17.6549C184.797 17.5736 184.732 17.5064 184.649 17.5064H182.055C181.974 17.5064 181.907 17.5721 181.907 17.6549ZM184.633 10.5846C184.291 10.2346 183.862 10.0596 183.348 10.0596C182.834 10.0596 182.42 10.2424 182.063 10.6064C181.702 10.9721 181.522 11.4049 181.522 11.9064C181.522 12.408 181.702 12.8564 182.063 13.2252C182.42 13.5939 182.85 13.7768 183.348 13.7768C183.846 13.7768 184.282 13.5986 184.626 13.2377C184.974 12.8768 185.146 12.4346 185.146 11.9064C185.146 11.3783 184.974 10.9393 184.633 10.5861V10.5846Z" fill="#421342"/><path id="Vector_8" d="M125.114 10.5065L116.072 30.4065H119.856C119.856 30.4065 126.599 14.6065 126.672 14.3347C126.716 14.1706 126.949 14.1706 126.996 14.3347C127.072 14.6019 131.048 23.7222 131.785 25.4112C131.837 25.5315 131.739 25.6581 131.609 25.6425L122.943 24.5581L136.736 30.4144C137.211 30.6159 137.684 30.1253 137.465 29.6581L128.482 10.5097C127.825 9.06123 125.77 9.06123 125.112 10.5097L125.114 10.5065Z" fill="#421342"/><path id="Vector_9" d="M112.366 9.30008L115.895 11.2579C116.09 11.3657 116.133 11.6298 115.98 11.7938L112.442 15.5876C112.23 15.8157 111.846 15.6657 111.847 15.3516L111.854 9.60008C111.854 9.33758 112.135 9.17195 112.364 9.30008H112.366Z" fill="#421342"/></g><path id="Vector_10" d="M20.0225 39.9375C31.028 39.9375 39.9497 31.0112 39.9497 20C39.9497 8.98882 31.028 0.0625 20.0225 0.0625C9.01696 0.0625 0.0952148 8.98882 0.0952148 20C0.0952148 31.0112 9.01696 39.9375 20.0225 39.9375Z" fill="#421342"/><g id="Group_3"><path id="Vector_11" d="M18.998 17.1502C18.998 17.1502 14.5034 15.5033 12.5638 15.0033C12.5638 15.0033 12.5622 15.0033 12.5607 15.0033C12.4701 14.9861 12.3764 14.9783 12.2811 14.9783C12.1796 14.9783 12.0797 14.9877 11.9829 15.0064C11.7439 15.0533 11.5237 15.1533 11.3348 15.2971C11.1942 15.4049 11.0724 15.5361 10.9724 15.683C10.9724 15.683 10.8194 15.9752 10.8194 15.9768C8.89538 19.6955 6.35293 28.1377 6.30608 28.2486C6.25142 28.3736 6.12649 28.4596 5.98281 28.4596C5.78604 28.4596 5.62675 28.3002 5.62831 28.1033C5.62831 28.0971 6.5747 16.5861 7.86778 11.7518C8.18637 10.5924 9.24832 9.73926 10.5086 9.73926C11.0412 9.73926 11.5378 9.89082 11.9579 10.1549C12.011 10.1877 12.025 10.1939 12.1156 10.2549C14.7268 12.1424 19.0027 17.1486 19.0027 17.1486L18.998 17.1502Z" fill="white"/><path id="Vector_12" d="M34.4229 27.1923C34.3933 27.9095 33.8014 28.4813 33.0768 28.4813C32.8847 28.4813 32.702 28.4407 32.5364 28.3688C31.4666 27.8313 22.6477 19.711 22.6477 19.711C22.6477 19.711 29.3427 23.6626 30.5125 24.2173C30.678 24.2954 30.8529 24.3595 30.9357 24.372C31.2105 24.4142 31.4573 24.1704 31.426 23.8845C31.3011 22.7454 29.7941 17.1735 29.2678 15.9423C29.0741 15.3813 28.5416 14.9798 27.9169 14.9798C27.7108 14.9798 27.514 15.0235 27.336 15.1032C25.9023 15.7017 14.9611 22.386 14.9611 22.1688C14.9611 22.0657 24.8435 12.3782 28.109 10.2438C28.5588 9.97197 29.1007 9.71729 29.6972 9.71729C30.8794 9.71729 31.8805 10.4892 32.2225 11.5563C32.2225 11.5563 32.2225 11.5569 32.2225 11.5579C32.4646 12.2532 34.1699 22.1001 34.412 26.9392C34.4151 27.0235 34.4198 27.1079 34.4229 27.1923Z" fill="white"/><path id="Vector_13" d="M24.0002 18.5249L27.2469 16.5733C27.5452 16.3937 27.9341 16.539 28.0434 16.8702L29.5676 21.5405C29.6035 21.6499 29.4864 21.7468 29.3865 21.6905L24.0033 18.678C23.9439 18.6452 23.9439 18.5608 24.0002 18.5265V18.5249Z" fill="white"/></g></g></svg>`;
  function whiteWordmark(s){ const i=s.indexOf('<path id="Vector_10"'); if(i<0) return s; return s.slice(0,i).replace(/#421342/g,"#ffffff")+s.slice(i); }
    (function(){
    const url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(whiteWordmark(RAW_SVG));
    const im=new Image(); im.onload=()=>{ brandImg=im; render(); }; im.onerror=()=>{}; im.src=url;
  })();

  const FIXED={text:"#ffffff",mut:"#CBA6CB",panel:"rgba(255,255,255,0.06)",stroke:"rgba(255,255,255,0.16)"};
  const BRAND_PURPLE="#45164a";

  const PRESETS={
    royal:{bgA:"#2a0a2a",bgB:"#48164c",glow:"#7d1f78",gold:"#E8C079",mag:"#C24BC2"},
    magenta:{bgA:"#3a0c38",bgB:"#7a1c6e",glow:"#c23bab",gold:"#FFD98A",mag:"#E26AD6"},
    onyx:{bgA:"#140711",bgB:"#2c0e2a",glow:"#5a1652",gold:"#E8C079",mag:"#A23F9E"}
  };
  const FORMATS=[
    {id:"catalog",nm:"Upwork Project Catalog"},
    {id:"portfolio",nm:"Upwork Portfolio"}
  ];
  const FMT_ICON={
    catalog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    portfolio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 15l-5.5-5-4 4-2-2L3 17"/></svg>'
  };
  const TEMPLATES=[
    {id:"editorial",nm:"Royal Editorial"},
    {id:"diagonal", nm:"Diagonal Split"},
    {id:"orbit",   nm:"Orbit"},
    {id:"dataLedger",nm:"Data Ledger"},
    {id:"auroraPill",nm:"Aurora Pill"},
    {id:"showcase",nm:"Showcase"},
    {id:"twinPanel",nm:"Twin Panel"},
    {id:"edgeLight",nm:"Edge Light"},
    {id:"horizonLine",nm:"Horizon Line"},
    {id:"cornerTag",nm:"Corner Tag"}
  ];
  // Each format has its own template lineup, in its own order.
  const FORMAT_TEMPLATES={
    catalog:["editorial","diagonal","orbit","dataLedger","auroraPill"],
    portfolio:["showcase","edgeLight","horizonLine","cornerTag","orbit","twinPanel"]
  };
  function templatesFor(fmt){ return (FORMAT_TEMPLATES[fmt]||[]).map(id=>TEMPLATES.find(t=>t.id===id)).filter(Boolean); }
  const DEFAULT={
    format:"catalog", template:"editorial",
    colors:JSON.parse(JSON.stringify(PRESETS.royal)),
    kicker:"META · GOOGLE · TIKTOK ADS",
    title:"Performance Marketing that Scales Ambitious Brands",
    subtitle:"Research, launch, optimize, scale — end to end. Built by a senior team.",
    metrics:[{v:"420%",l:"Average ROAS"},{v:"100+",l:"Projects scaled"},{v:"$1.5M+",l:"Ad budget managed"}],
    mainData:null
  };
  let state=clone(DEFAULT), mainImg=null;
  // Whether the Template list is expanded — starts collapsed every visit;
  // opens once the user actively picks a format button (not persisted).
  let templatesOpen=false;

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function theme(){ return Object.assign({}, FIXED, state.colors); }

  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }
  function load(){ try{ const s=localStorage.getItem(KEY); if(s){ state=Object.assign(clone(DEFAULT), JSON.parse(s));
      state.colors=Object.assign(clone(PRESETS.royal), state.colors||{}); } }catch(e){} }
  function loadImg(data,set){ if(!data){set(null);return;} const im=new Image(); im.onload=()=>{set(im);render();}; im.src=data; }

  function rr(ctx,x,y,w,h,r){ r=Math.min(r,w/2,h/2);
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
  function cover(ctx,img,x,y,w,h){
    const ir=img.width/img.height, r=w/h; let sw,sh,sx,sy;
    if(ir>r){ sh=img.height; sw=sh*r; sx=(img.width-sw)/2; sy=0; }
    else { sw=img.width; sh=sw/r; sx=0; sy=(img.height-sh)/2; }
    ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h); }
  function ls(ctx,px){ try{ ctx.letterSpacing=px+"px"; }catch(e){} }
  function wrap(ctx,text,maxW){
    const words=String(text).split(/\s+/), lines=[]; let line="";
    for(const w of words){ const t=line?line+" "+w:w;
      if(ctx.measureText(t).width>maxW && line){ lines.push(line); line=w; } else line=t; }
    if(line) lines.push(line); return lines; }
  function metrics(){ return state.metrics.filter(m=>m && (m.v||"").trim()); }

  function placeholder(ctx,x,y,w,h,r,T){
    ctx.save(); rr(ctx,x,y,w,h,r); ctx.fillStyle=T.panel; ctx.fill();
    ctx.setLineDash([8,8]); ctx.lineWidth=1.5; ctx.strokeStyle=T.stroke; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=T.mut; ctx.textAlign="center"; ctx.textBaseline="middle";
    ls(ctx,2); ctx.font='400 14px "Space Mono",monospace'; ctx.fillText("DROP IMAGE", x+w/2, y+h/2); ls(ctx,0);
    ctx.restore(); }
  function imgBox(ctx,img,x,y,w,h,r,T){
    if(img){ ctx.save(); rr(ctx,x,y,w,h,r); ctx.clip(); cover(ctx,img,x,y,w,h); ctx.restore();
      ctx.save(); rr(ctx,x,y,w,h,r); ctx.lineWidth=1; ctx.strokeStyle=T.stroke; ctx.stroke(); ctx.restore(); }
    else placeholder(ctx,x,y,w,h,r,T); }

  /* logo: uses your uploaded file if present, else vector fallback */
  function logoWidth(ctx,H){ H=H||46;
    if(brandImg) return H*(brandImg.width/brandImg.height);
    ctx.font='700 '+Math.round(H*0.5)+'px "Space Grotesk",sans-serif'; ls(ctx,.2);
    const ww=ctx.measureText("Monarchi").width; ls(ctx,0); return H+12+ww; }
  function logo(ctx,x,y,T,H){
    H=H||46;
    if(brandImg){ const w=H*(brandImg.width/brandImg.height); ctx.drawImage(brandImg,x,y,w,H); return w; }
    const r=H/2, cx=x+r, cy=y+r;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle=BRAND_PURPLE; ctx.fill();
    ctx.translate(cx,cy); const u=r*0.6;
    ctx.strokeStyle="#ffffff"; ctx.lineWidth=H*0.13; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath();
    ctx.moveTo(-u,u*0.78); ctx.lineTo(-u*0.52,-u*0.92); ctx.lineTo(0,u*0.06); ctx.lineTo(u*0.52,-u*0.92); ctx.lineTo(u,u*0.78);
    ctx.stroke();
    ctx.fillStyle="#ffffff";
    ctx.beginPath(); ctx.moveTo(u*0.18,-u*0.18); ctx.lineTo(u*0.52,-u*0.5); ctx.lineTo(u*0.18,-u*0.52); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle=T.text; ctx.textBaseline="middle"; ctx.textAlign="left";
    ctx.font='700 '+Math.round(H*0.5)+'px "Space Grotesk",sans-serif'; ls(ctx,.2);
    ctx.fillText("Monarchi", x+H+12, cy+1); const ww=ctx.measureText("Monarchi").width; ls(ctx,0);
    return H+12+ww;
  }

  function kickerPill(ctx,x,y,text,T,align){
    if(!text) return; ctx.font='700 11px "Space Mono",monospace'; ls(ctx,2);
    const tw=ctx.measureText(text.toUpperCase()).width, padX=14,h=26,w=tw+padX*2;
    const bx=align==="right"? x-w : x;
    rr(ctx,bx,y,w,h,13); ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fill();
    ctx.lineWidth=1; ctx.strokeStyle=T.stroke; ctx.stroke();
    ctx.fillStyle=T.gold; ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText(text.toUpperCase(), bx+padX, y+h/2+1); ls(ctx,0); }

  function metricRow(ctx,x,y,T,gap,chips){
    const ms=metrics(); if(!ms.length) return; ctx.textAlign="left"; let cx=x;
    ms.forEach((m)=>{
      if(chips){
        const lab=(m.l||"").toUpperCase();
        ctx.font='400 10.5px "Space Mono",monospace'; ls(ctx,1.2); const lw=ctx.measureText(lab).width; ls(ctx,0);
        ctx.font='700 20px "Space Grotesk",sans-serif'; const vw=ctx.measureText(m.v).width;
        const w=Math.max(vw,lw)+30, h=58;
        rr(ctx,cx,y,w,h,12); ctx.fillStyle="rgba(255,255,255,0.06)"; ctx.fill();
        ctx.lineWidth=1; ctx.strokeStyle=T.stroke; ctx.stroke();
        ctx.fillStyle=T.gold; ctx.textBaseline="alphabetic"; ctx.font='700 20px "Space Grotesk",sans-serif';
        ctx.fillText(m.v, cx+15, y+27);
        ctx.fillStyle=T.mut; ls(ctx,1.2); ctx.font='400 10px "Space Mono",monospace';
        ctx.fillText(lab, cx+15, y+45); ls(ctx,0); cx+=w+(gap||12);
      } else {
        ctx.fillStyle=T.gold; ctx.textBaseline="alphabetic"; ctx.font='700 34px "Space Grotesk",sans-serif';
        ctx.fillText(m.v, cx, y); const vw=ctx.measureText(m.v).width;
        ctx.fillStyle=T.mut; ls(ctx,1.4); ctx.font='400 11px "Space Mono",monospace';
        ctx.fillText((m.l||"").toUpperCase(), cx, y+22); const lw=ctx.measureText((m.l||"").toUpperCase()).width; ls(ctx,0);
        cx+=Math.max(vw,lw)+(gap||56);
      }
    });
  }
  function bg(ctx,T){
    const g=ctx.createLinearGradient(0,0,1000,750); g.addColorStop(0,T.bgA); g.addColorStop(1,T.bgB);
    ctx.fillStyle=g; ctx.fillRect(0,0,1000,750);
    const rg=ctx.createRadialGradient(820,120,40,820,120,640); rg.addColorStop(0,T.glow); rg.addColorStop(1,"rgba(0,0,0,0)");
    ctx.globalAlpha=.55; ctx.fillStyle=rg; ctx.fillRect(0,0,1000,750); ctx.globalAlpha=1; }
  /* Horizontally-centered metric block (value+label groups with thin dividers),
     meant to sit as a compact stat strip near the bottom of a cover image.
     cy = baseline y for the value line. scale sizes the whole block up/down
     (1 = a comfortable default, roughly 2x the old bottom-left chip row).
     Auto-shrinks if the content would run wider than maxWidth, so long
     values/labels can never overflow the 1000px-wide canvas. */
  function metricRowHero(ctx,cy,T,scale,maxWidth){
    const ms=metrics(); if(!ms.length) return; scale=scale||1; maxWidth=maxWidth||860;
    const LABEL_RATIO=0.72; // labels read clearly, just a step below the value — not tiny caption text
    function measure(valSize){
      const labSize=Math.max(15,Math.round(valSize*LABEL_RATIO));
      const valFont='800 '+valSize+'px "Space Grotesk",sans-serif';
      const labFont='700 '+labSize+'px "Space Mono",monospace';
      const widths=ms.map(m=>{
        ctx.font=valFont; const vw=ctx.measureText(m.v).width;
        ctx.font=labFont; ls(ctx,1.5); const lw=ctx.measureText((m.l||"").toUpperCase()).width; ls(ctx,0);
        return Math.max(vw,lw);
      });
      const gap=Math.round(valSize*0.85);
      const total=widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,ms.length-1);
      return {widths,gap,total,valFont,labFont,valSize,labSize};
    }
    let valSize=Math.round(48*scale);
    let m=measure(valSize);
    if(m.total>maxWidth){
      const r=maxWidth/m.total;
      valSize=Math.max(22,Math.round(valSize*r));
      m=measure(valSize);
    }
    const {widths,gap,valFont,labFont,labSize}=m;
    let cx=500-m.total/2;
    ctx.textBaseline="alphabetic";
    const labelY=cy+Math.round(valSize*0.22)+labSize;
    ms.forEach((mt,i)=>{
      const w=widths[i], mid=cx+w/2;
      ctx.textAlign="center";
      ctx.fillStyle=T.gold; ctx.font=valFont;
      ctx.fillText(mt.v, mid, cy);
      ctx.fillStyle=T.mut; ls(ctx,1.5); ctx.font=labFont;
      ctx.fillText((mt.l||"").toUpperCase(), mid, labelY); ls(ctx,0);
      if(i<ms.length-1){
        const dx=cx+w+gap/2;
        ctx.strokeStyle=T.stroke; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(dx,cy-valSize*0.72); ctx.lineTo(dx,labelY+Math.round(labSize*0.25)); ctx.stroke();
      }
      cx+=w+gap;
    });
    ctx.textAlign="left";
  }

  const DRAW={
    editorial(ctx,T){
      bg(ctx,T);
      imgBox(ctx,mainImg,600,150,336,536,26,T);
      logo(ctx,64,56,T,46);
      kickerPill(ctx,64,150,state.kicker,T,"left");
      ctx.fillStyle=T.gold; ctx.fillRect(64,232,46,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 50px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,488); let ty=252;
      tl.slice(0,4).forEach(l=>{ctx.fillText(l,64,ty); ty+=56;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 18px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,488); ty+=8;
      sl.slice(0,3).forEach(l=>{ctx.fillText(l,64,ty); ty+=26;});
      metricRow(ctx,64,648,T,56,false);
    },
    diagonal(ctx,T){
      const g=ctx.createLinearGradient(0,0,1000,750); g.addColorStop(0,T.bgA); g.addColorStop(1,T.bgB);
      ctx.fillStyle=g; ctx.fillRect(0,0,1000,750);
      ctx.save(); ctx.beginPath(); ctx.moveTo(600,0); ctx.lineTo(1000,0); ctx.lineTo(1000,750); ctx.lineTo(470,750); ctx.closePath(); ctx.clip();
      const wg=ctx.createLinearGradient(470,0,1000,750); wg.addColorStop(0,T.mag); wg.addColorStop(1,T.gold);
      ctx.fillStyle=wg; ctx.fillRect(0,0,1000,750); ctx.restore();
      ctx.save(); ctx.shadowColor="rgba(0,0,0,.45)"; ctx.shadowBlur=40; ctx.shadowOffsetY=20;
      rr(ctx,612,170,316,410,22); ctx.fillStyle="#fff"; ctx.fill(); ctx.restore();
      imgBox(ctx,mainImg,612,170,316,410,22,T);
      logo(ctx,64,56,T,46);
      kickerPill(ctx,936,60,state.kicker,T,"right");
      ctx.fillStyle=T.gold; ctx.fillRect(64,250,46,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 46px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,470); let ty=270;
      tl.slice(0,4).forEach(l=>{ctx.fillText(l,64,ty); ty+=52;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 17px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,440); ty+=8;
      sl.slice(0,3).forEach(l=>{ctx.fillText(l,64,ty); ty+=24;});
      metricRow(ctx,64,654,T,12,true);
    },
    showcase(ctx,T){
      if(mainImg){ cover(ctx,mainImg,0,0,1000,750); }
      else { bg(ctx,T); placeholder(ctx,300,250,400,250,18,T); }
      const tg=ctx.createLinearGradient(0,0,0,170); tg.addColorStop(0,"rgba(13,4,14,.6)"); tg.addColorStop(1,"rgba(13,4,14,0)");
      ctx.fillStyle=tg; ctx.fillRect(0,0,1000,170);
      const sc=ctx.createLinearGradient(0,170,0,750);
      sc.addColorStop(0,"rgba(13,4,14,.15)"); sc.addColorStop(.45,"rgba(13,4,14,.62)"); sc.addColorStop(1,"rgba(13,4,14,.95)");
      ctx.fillStyle=sc; ctx.fillRect(0,170,1000,580);

      const lw=logoWidth(ctx,44); const chipW=16+lw+16;
      rr(ctx,52,48,chipW,62,14); ctx.fillStyle="rgba(13,5,14,.55)"; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle="rgba(255,255,255,.14)"; ctx.stroke();
      logo(ctx,68,57,T,44);
      kickerPill(ctx,936,60,state.kicker,T,"right");

      /* Title, subtitle and metrics now sit together as one bottom-anchored
         group — title/subtitle sit low, right above the metric strip, rather
         than being stranded up near the header. Metrics position is derived
         from however many lines title+subtitle actually take, so the group
         always sits close together regardless of text length. */
      ctx.fillStyle=T.text; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
      ctx.font='700 48px "Space Grotesk",sans-serif'; ls(ctx,-.45);
      const tl=wrap(ctx,state.title,780); let ty=480;
      tl.slice(0,2).forEach(l=>{ ctx.fillText(l,500,ty); ty+=54; }); ls(ctx,0);

      ctx.fillStyle=T.mut; ctx.font='400 16px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,640); ty+=8;
      sl.slice(0,2).forEach(l=>{ ctx.fillText(l,500,ty); ty+=22; });

      ctx.fillStyle=T.gold; ctx.fillRect(477,ty+20,46,4);
      metricRowHero(ctx,Math.min(ty+86,668),T,1);
      ctx.textAlign="left";
    },
    /* --- Three more full-bleed-image covers in the Showcase family (image
       as background, text as foreground) — each with a different modern
       arrangement of the same pieces (logo, kicker, title, subtitle, metrics). --- */
    edgeLight(ctx,T){
      if(mainImg){ cover(ctx,mainImg,0,0,1000,750); }
      else { bg(ctx,T); placeholder(ctx,300,250,400,250,18,T); }
      const rg=ctx.createRadialGradient(60,750,40,60,750,820);
      rg.addColorStop(0,"rgba(10,4,10,.88)"); rg.addColorStop(1,"rgba(10,4,10,0)");
      ctx.fillStyle=rg; ctx.fillRect(0,0,1000,750);
      const tg=ctx.createLinearGradient(0,0,0,120); tg.addColorStop(0,"rgba(10,4,10,.4)"); tg.addColorStop(1,"rgba(10,4,10,0)");
      ctx.fillStyle=tg; ctx.fillRect(0,0,1000,120);

      logo(ctx,56,48,T,38);
      kickerPill(ctx,56,432,state.kicker,T,"left");

      ctx.fillStyle=T.gold; ctx.fillRect(56,488,44,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
      ctx.font='700 44px "Space Grotesk",sans-serif'; ls(ctx,-.4);
      const tl=wrap(ctx,state.title,560); let ty=548;
      tl.slice(0,2).forEach(l=>{ ctx.fillText(l,56,ty); ty+=48; }); ls(ctx,0);

      ctx.fillStyle=T.mut; ctx.font='400 16px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,520); ty+=8;
      sl.slice(0,2).forEach(l=>{ ctx.fillText(l,56,ty); ty+=22; });

      metricRow(ctx,56,Math.min(ty+36,690),T,14,true);
    },
    horizonLine(ctx,T){
      if(mainImg){ cover(ctx,mainImg,0,0,1000,750); }
      else { bg(ctx,T); placeholder(ctx,300,220,400,260,18,T); }
      const tg=ctx.createLinearGradient(0,0,0,140); tg.addColorStop(0,"rgba(10,4,10,.5)"); tg.addColorStop(1,"rgba(10,4,10,0)");
      ctx.fillStyle=tg; ctx.fillRect(0,0,1000,140);
      const bb=ctx.createLinearGradient(0,600,0,750); bb.addColorStop(0,"rgba(10,4,10,0)"); bb.addColorStop(1,"rgba(10,4,10,.7)");
      ctx.fillStyle=bb; ctx.fillRect(0,600,1000,150);

      logo(ctx,56,50,T,38);
      kickerPill(ctx,944,54,state.kicker,T,"right");

      ctx.fillStyle=T.text; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
      ctx.font='700 46px "Space Grotesk",sans-serif'; ls(ctx,-.4);
      const tl=wrap(ctx,state.title,720); let ty=356;
      tl.slice(0,2).forEach(l=>{ ctx.fillText(l,500,ty); ty+=52; }); ls(ctx,0);

      ctx.fillStyle=T.gold; ctx.fillRect(470,ty+14,60,3);

      ctx.fillStyle=T.mut; ctx.font='400 16px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,600); ty+=34;
      sl.slice(0,2).forEach(l=>{ ctx.fillText(l,500,ty); ty+=22; });

      metricRowHero(ctx,700,T,0.85);
      ctx.textAlign="left";
    },
    cornerTag(ctx,T){
      if(mainImg){ cover(ctx,mainImg,0,0,1000,750); }
      else { bg(ctx,T); placeholder(ctx,220,140,560,460,18,T); }

      const lw=logoWidth(ctx,36); const chipW=16+lw+16;
      rr(ctx,44,40,chipW,52,13); ctx.fillStyle="rgba(13,5,14,.5)"; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle="rgba(255,255,255,.15)"; ctx.stroke();
      logo(ctx,58,48,T,36);

      const tw=560, tx=1000-40-tw, ty0=750-40-236, th=236, tr=24;
      ctx.save(); ctx.shadowColor="rgba(0,0,0,.4)"; ctx.shadowBlur=36; ctx.shadowOffsetY=14;
      rr(ctx,tx,ty0,tw,th,tr); ctx.fillStyle="rgba(16,7,16,.84)"; ctx.fill(); ctx.restore();
      ctx.save(); rr(ctx,tx,ty0,tw,th,tr); ctx.lineWidth=1; ctx.strokeStyle="rgba(255,255,255,.18)"; ctx.stroke(); ctx.restore();

      ctx.fillStyle=T.gold; ctx.fillRect(tx+30,ty0+30,40,3);

      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 28px "Space Grotesk",sans-serif'; ls(ctx,-.3);
      const tl=wrap(ctx,state.title,tw-60); let ly=ty0+46;
      tl.slice(0,2).forEach(l=>{ ctx.fillText(l,tx+30,ly); ly+=34; }); ls(ctx,0);

      metricRow(ctx,tx+30,ly+16,T,10,true);
    },
    orbit(ctx,T){
      const g=ctx.createLinearGradient(0,0,1000,750); g.addColorStop(0,T.bgA); g.addColorStop(1,T.bgB); ctx.fillStyle=g; ctx.fillRect(0,0,1000,750);
      const ox=765,oy=375;
      ctx.lineWidth=2;
      for(let i=0;i<8;i++){ const r=110+i*70; ctx.beginPath(); ctx.arc(ox,oy,r,0,Math.PI*2); ctx.strokeStyle=i%2?"rgba(232,192,121,0.16)":"rgba(194,75,194,0.18)"; ctx.stroke(); }
      const rg=ctx.createRadialGradient(ox,oy,0,ox,oy,440); rg.addColorStop(0,T.glow); rg.addColorStop(1,"rgba(0,0,0,0)"); ctx.globalAlpha=.5; ctx.fillStyle=rg; ctx.fillRect(0,0,1000,750); ctx.globalAlpha=1;
      const cr=180;
      if(mainImg){ ctx.save(); ctx.beginPath(); ctx.arc(ox,oy,cr,0,Math.PI*2); ctx.clip(); cover(ctx,mainImg,ox-cr,oy-cr,cr*2,cr*2); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.arc(ox,oy,cr,0,Math.PI*2); ctx.lineWidth=2; ctx.strokeStyle="rgba(255,255,255,0.28)"; ctx.stroke(); ctx.restore(); }
      else { ctx.save(); ctx.beginPath(); ctx.arc(ox,oy,cr,0,Math.PI*2); ctx.fillStyle=T.panel; ctx.fill(); ctx.setLineDash([8,8]); ctx.lineWidth=1.5; ctx.strokeStyle=T.stroke; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle=T.mut; ctx.textAlign="center"; ctx.textBaseline="middle"; ls(ctx,2); ctx.font='400 13px "Space Mono",monospace'; ctx.fillText("DROP IMAGE",ox,oy); ls(ctx,0); ctx.restore(); }
      logo(ctx,64,56,T,46);
      kickerPill(ctx,64,150,state.kicker,T,"left");
      ctx.fillStyle=T.gold; ctx.fillRect(64,232,46,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top"; ctx.font='700 50px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,452); let ty=252;
      tl.slice(0,4).forEach(l=>{ctx.fillText(l,64,ty); ty+=56;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 17px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,420); ty+=8;
      sl.slice(0,2).forEach(l=>{ctx.fillText(l,64,ty); ty+=24;});
      metricRow(ctx,64,656,T,48,false);
    },
    dataLedger(ctx,T){
      bg(ctx,T);
      ctx.save(); ctx.strokeStyle="rgba(255,255,255,.05)"; ctx.lineWidth=1;
      for(let x=0;x<=1000;x+=50){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,750); ctx.stroke(); }
      for(let y=0;y<=750;y+=50){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(1000,y); ctx.stroke(); }
      ctx.restore();
      const ms=metrics();
      if(ms.length){
        ctx.save(); ctx.globalAlpha=.10; ctx.fillStyle=T.gold; ctx.textAlign="right"; ctx.textBaseline="alphabetic";
        ctx.font='800 300px "Space Grotesk",sans-serif'; ctx.fillText(ms[0].v, 980, 720); ctx.restore();
      }
      imgBox(ctx,mainImg,624,56,320,210,18,T);
      logo(ctx,64,56,T,44);
      kickerPill(ctx,64,150,state.kicker,T,"left");
      ctx.fillStyle=T.gold; ctx.fillRect(64,232,46,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 44px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,540); let ty=252;
      tl.slice(0,3).forEach(l=>{ctx.fillText(l,64,ty); ty+=50;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 16px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,540); ty+=8;
      sl.slice(0,2).forEach(l=>{ctx.fillText(l,64,ty); ty+=22;});
      let my=ty+30;
      ms.forEach((m,i)=>{
        if(i>0){ ctx.strokeStyle=T.stroke; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(64,my-14); ctx.lineTo(600,my-14); ctx.stroke(); }
        ctx.fillStyle=T.mut; ls(ctx,1.5); ctx.font='400 11px "Space Mono",monospace'; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
        ctx.fillText((m.l||"").toUpperCase(),64,my); ls(ctx,0);
        ctx.fillStyle=T.gold; ctx.textAlign="right"; ctx.font='700 22px "Space Grotesk",sans-serif';
        ctx.fillText(m.v,600,my); ctx.textAlign="left";
        my+=40;
      });
    },
    twinPanel(ctx,T){
      const g=ctx.createLinearGradient(0,0,460,750); g.addColorStop(0,T.bgB); g.addColorStop(1,T.bgA);
      ctx.fillStyle=g; ctx.fillRect(0,0,460,750);
      if(mainImg){ cover(ctx,mainImg,460,0,540,750); }
      else { ctx.fillStyle=T.panel; ctx.fillRect(460,0,540,750); placeholder(ctx,540,260,360,230,18,T); }
      ctx.fillStyle=T.gold; ctx.fillRect(458,0,3,750);
      logo(ctx,48,52,T,42);
      kickerPill(ctx,48,142,state.kicker,T,"left");
      ctx.fillStyle=T.gold; ctx.fillRect(48,222,42,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 38px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,368); let ty=242;
      tl.slice(0,4).forEach(l=>{ctx.fillText(l,48,ty); ty+=44;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 15px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,368); ty+=6;
      sl.slice(0,4).forEach(l=>{ctx.fillText(l,48,ty); ty+=21;});
      const sy=662, sh=88;
      const sc=ctx.createLinearGradient(0,sy,0,750); sc.addColorStop(0,"rgba(8,3,8,0)"); sc.addColorStop(1,"rgba(8,3,8,.6)");
      ctx.fillStyle=sc; ctx.fillRect(460,sy,540,sh);
      ctx.fillStyle="rgba(8,3,8,.55)"; ctx.fillRect(0,sy,460,sh);
      ctx.strokeStyle=T.stroke; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(1000,sy); ctx.stroke();
      metricRow(ctx,48,sy+16,T,10,true);
    },
    auroraPill(ctx,T){
      const g=ctx.createLinearGradient(0,0,1000,750); g.addColorStop(0,T.bgA); g.addColorStop(1,T.bgB);
      ctx.fillStyle=g; ctx.fillRect(0,0,1000,750);
      const b1=ctx.createRadialGradient(160,140,0,160,140,340); b1.addColorStop(0,T.mag); b1.addColorStop(1,"rgba(0,0,0,0)");
      ctx.globalAlpha=.35; ctx.fillStyle=b1; ctx.fillRect(0,0,1000,750);
      const b2=ctx.createRadialGradient(860,620,0,860,620,380); b2.addColorStop(0,T.gold); b2.addColorStop(1,"rgba(0,0,0,0)");
      ctx.globalAlpha=.22; ctx.fillStyle=b2; ctx.fillRect(0,0,1000,750); ctx.globalAlpha=1;
      rr(ctx,48,44,904,64,32); ctx.fillStyle="rgba(255,255,255,.06)"; ctx.fill();
      ctx.lineWidth=1; ctx.strokeStyle=T.stroke; ctx.stroke();
      logo(ctx,70,60,T,36);
      kickerPill(ctx,928,60,state.kicker,T,"right");
      imgBox(ctx,mainImg,616,150,336,320,28,T);
      ctx.fillStyle=T.gold; ctx.fillRect(64,270,44,4);
      ctx.fillStyle=T.text; ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.font='700 44px "Space Grotesk",sans-serif'; ls(ctx,-.5);
      const tl=wrap(ctx,state.title,500); let ty=290;
      tl.slice(0,3).forEach(l=>{ctx.fillText(l,64,ty); ty+=48;}); ls(ctx,0);
      ctx.fillStyle=T.mut; ctx.font='400 16px "Space Grotesk",sans-serif';
      const sl=wrap(ctx,state.subtitle,480); ty+=6;
      sl.slice(0,3).forEach(l=>{ctx.fillText(l,64,ty); ty+=22;});
      const ms=metrics();
      if(ms.length){
        const paddedItems = ms.map(m=>{
          const lab=(m.l||"").toUpperCase();
          ctx.font='400 10.5px "Space Mono",monospace'; const lw2=ctx.measureText(lab).width;
          ctx.font='700 22px "Space Grotesk",sans-serif'; const vw=ctx.measureText(m.v).width;
          return {m, w:Math.max(vw,lw2)+44};
        });
        const gap=16; const total=paddedItems.reduce((s,p)=>s+p.w,0)+gap*(paddedItems.length-1);
        let cx=(1000-total)/2; const y=666, h=56;
        paddedItems.forEach(p=>{
          rr(ctx,cx,y,p.w,h,h/2); ctx.fillStyle="rgba(255,255,255,.08)"; ctx.fill();
          ctx.lineWidth=1; ctx.strokeStyle=T.stroke; ctx.stroke();
          ctx.textAlign="center";
          ctx.fillStyle=T.gold; ctx.textBaseline="alphabetic"; ctx.font='700 22px "Space Grotesk",sans-serif';
          ctx.fillText(p.m.v, cx+p.w/2, y+24);
          ctx.fillStyle=T.mut; ls(ctx,1); ctx.font='400 9.5px "Space Mono",monospace';
          ctx.fillText((p.m.l||"").toUpperCase(), cx+p.w/2, y+42); ls(ctx,0);
          ctx.textAlign="left";
          cx+=p.w+gap;
        });
      }
    }
  };

  /* Canvas size comes from the selected template (all older templates are
     1000x750; the square cover set declares w/h:1000x1000 in TEMPLATES). */
  function dims(){ const t=TEMPLATES.find(t=>t.id===state.template); return { w:(t&&t.w)||1000, h:(t&&t.h)||750 }; }
  function paint(ctx){ const T=theme(); const d=dims(); ctx.clearRect(0,0,d.w,d.h); (DRAW[state.template]||DRAW.editorial)(ctx,T); }
  const cv=$("cv");
  function syncAspect(w,h){ const wrap=cv.parentElement; if(wrap){ wrap.style.aspectRatio=w+" / "+h; wrap.style.setProperty("--cv-w",w+"px"); wrap.style.setProperty("--cv-h",h+"px"); } }
  function render(){
    const d=dims();
    const S=Math.min(window.devicePixelRatio||1,2)*2;
    cv.width=d.w*S; cv.height=d.h*S;
    const ctx=cv.getContext("2d"); ctx.setTransform(S,0,0,S,0,0); ctx.textBaseline="top"; paint(ctx);
    syncAspect(d.w,d.h);
  }
  function buildURL(type){
    const d=dims();
    const c=document.createElement("canvas"); c.width=d.w; c.height=d.h;
    const ctx=c.getContext("2d"); ctx.setTransform(1,0,0,1,0,0); ctx.textBaseline="top";
    if(type==="jpeg"){ ctx.fillStyle="#000"; ctx.fillRect(0,0,d.w,d.h); }
    paint(ctx);
    return c.toDataURL(type==="jpeg"?"image/jpeg":"image/png", type==="jpeg"?0.95:undefined);
  }
  function dataURLtoBlob(durl){
    const parts=durl.split(","); const mime=(parts[0].match(/:(.*?);/)||[,"image/png"])[1];
    const bin=atob(parts[1]); const len=bin.length; const arr=new Uint8Array(len);
    for(let i=0;i<len;i++) arr[i]=bin.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }
  function showExport(durl,fn){
    let blobUrl; try{ blobUrl=URL.createObjectURL(dataURLtoBlob(durl)); }catch(e){ blobUrl=durl; }
    const ov=document.createElement("div"); ov.className="ov";
    const box=document.createElement("div"); box.className="ovbox";
    box.innerHTML='<div class="ovtop"><b>'+fn+'</b><button class="ovx">✕</button></div>';
    const img=document.createElement("img"); img.src=blobUrl; box.appendChild(img);
    const row=document.createElement("div"); row.className="ovrow";
    const a=document.createElement("a"); a.className="btn btn-p"; a.textContent="↓ Download"; a.href=blobUrl; a.download=fn;
    const a2=document.createElement("a"); a2.className="btn"; a2.textContent="Open in new tab"; a2.href=blobUrl; a2.target="_blank"; a2.rel="noopener";
    const hint=document.createElement("span"); hint.className="ovhint"; hint.textContent="If nothing downloads, use “Open in new tab” or right-click the image → Save image as…";
    row.appendChild(a); row.appendChild(a2); row.appendChild(hint); box.appendChild(row); ov.appendChild(box);
    document.getElementById("app").appendChild(ov);
    function close(){ try{ if(blobUrl!==durl) setTimeout(()=>URL.revokeObjectURL(blobUrl),3000); }catch(e){} ov.remove(); }
    box.querySelector(".ovx").onclick=close;
    ov.addEventListener("click",e=>{ if(e.target===ov) close(); });
  }
  function exportImg(type){
    let durl; try{ durl=buildURL(type); }catch(e){ alert("Export failed: "+e.message); return; }
    showExport(durl, "monarchi-"+state.template+"-"+state.format+(type==="jpeg"?".jpg":".png"));
    if(onExport){ try{ onExport({ format:state.format, template:state.template, type }); }catch(e){} }
  }

  const SW={
    editorial:c=>"linear-gradient(135deg,"+c.bgA+","+c.bgB+")",
    diagonal:c=>"linear-gradient(115deg,"+c.bgB+" 45%,"+c.mag+" 45%,"+c.gold+")",
    showcase:c=>"linear-gradient(180deg,#5a2d57,"+c.bgA+")",
    orbit:c=>"radial-gradient(circle at 76% 50%,"+c.glow+" 0%,"+c.bgB+" 45%,"+c.bgA+" 100%)",
    dataLedger:c=>"repeating-linear-gradient(0deg,"+c.bgA+" 0px,"+c.bgA+" 6px, rgba(255,255,255,.08) 6px 7px),repeating-linear-gradient(90deg,"+c.bgA+" 0px,"+c.bgA+" 6px, rgba(255,255,255,.08) 6px 7px)",
    twinPanel:c=>"linear-gradient(90deg,"+c.bgB+" 0%,"+c.bgB+" 48%,"+c.gold+" 48%,"+c.gold+" 50%,"+c.mag+" 50%,"+c.bgA+" 100%)",
    auroraPill:c=>"radial-gradient(circle at 18% 25%,"+c.mag+" 0%, transparent 45%),radial-gradient(circle at 82% 80%,"+c.gold+" 0%, transparent 45%),linear-gradient("+c.bgA+","+c.bgB+")",
    edgeLight:c=>"radial-gradient(circle at 15% 100%,"+c.glow+" 0%,"+c.bgB+" 45%,"+c.bgA+" 100%)",
    horizonLine:c=>"linear-gradient(180deg,"+c.bgB+" 0%,"+c.bgA+" 50%,"+c.bgB+" 100%)",
    cornerTag:c=>"linear-gradient(135deg,"+c.bgA+" 0%,"+c.bgA+" 55%,"+c.mag+" 100%)"
  };
  function buildFormats(){
    const box=$("fmtGrid"); box.innerHTML="";
    FORMATS.forEach(f=>{
      const b=document.createElement("button"); b.type="button"; b.className="fmt-btn"+(templatesOpen&&state.format===f.id?" on":"");
      b.innerHTML='<span class="fmt-ico">'+(FMT_ICON[f.id]||"")+'</span><span class="fmt-nm">'+f.nm+'</span>';
      b.onclick=()=>selectFormat(f.id);
      box.appendChild(b);
    });
  }
  function selectFormat(fmt){
    state.format=fmt;
    if(!templatesFor(fmt).some(t=>t.id===state.template)) state.template=templatesFor(fmt)[0].id;
    templatesOpen=true;
    save(); buildFormats(); buildCards(); updateMeta(); render();
  }
  function buildCards(){
    const section=$("templateSection"); if(section) section.hidden=!templatesOpen;
    const box=$("cards"); box.innerHTML=""; const c=state.colors;
    templatesFor(state.format).forEach((t,i)=>{
      const b=document.createElement("button"); b.className="card"+(state.template===t.id?" on":""); b.dataset.tpl=t.id;
      b.innerHTML='<div class="sw"></div><div class="num">0'+(i+1)+'</div><div class="nm">'+t.nm+'</div>';
      const sw=b.querySelector(".sw");
      sw.style.background=(SW[t.id]||SW.editorial)(c);
      b.onclick=()=>{ state.template=t.id; save(); buildCards(); updateMeta(); render(); };
      box.appendChild(b);
    });
  }
  function isDefaultColors(){ return JSON.stringify(state.colors)===JSON.stringify(PRESETS.royal); }
  function buildPresets(){
    const box=$("presets"); box.innerHTML="";
    Object.keys(PRESETS).forEach(k=>{
      const p=PRESETS[k]; const b=document.createElement("button"); b.className="preset"; b.title=k;
      b.style.background="linear-gradient(135deg,"+p.bgA+","+p.bgB+" 55%,"+p.mag+")";
      if(JSON.stringify(p)===JSON.stringify(state.colors)) b.classList.add("on");
      b.onclick=()=>{ state.colors=clone(p); save(); syncColors(); buildPresets(); buildCards(); render(); };
      box.appendChild(b);
    });
    $("resetColorsBtn").hidden=isDefaultColors();
  }
  function syncColors(){ $("cBgA").value=state.colors.bgA;$("cBgB").value=state.colors.bgB;$("cGlow").value=state.colors.glow;$("cGold").value=state.colors.gold;$("cMag").value=state.colors.mag; }
  function bindColors(){
    const map={cBgA:"bgA",cBgB:"bgB",cGlow:"glow",cGold:"gold",cMag:"mag"};
    Object.keys(map).forEach(id=>{ $(id).oninput=e=>{ state.colors[map[id]]=e.target.value; save(); buildPresets(); buildCards(); render(); }; });
  }

  function syncSlot(data){
    const slot=$("imgSlot"), clr=$("imgClear");
    if(data){ slot.innerHTML=""; const im=document.createElement("img"); im.src=data; slot.appendChild(im); clr.hidden=false; }
    else { slot.innerHTML='<div class="slot-in"><span class="up">⬆</span><b>Main image</b><i>click or drop</i></div>'; clr.hidden=true; }
  }
  function fileToData(file,cb){ const r=new FileReader(); r.onload=e=>cb(e.target.result); r.readAsDataURL(file); }
  function setMain(d){ state.mainData=d; loadImg(d,im=>mainImg=im); syncSlot(d); save(); }
  function bindImage(){
    const slot=$("imgSlot"), file=$("imgFile");
    slot.onclick=()=>file.click();
    file.onchange=e=>{ const f=e.target.files[0]; if(f) fileToData(f,setMain); file.value=""; };
    ["dragover","dragenter"].forEach(ev=>slot.addEventListener(ev,e=>{e.preventDefault();slot.classList.add("drag");}));
    ["dragleave","drop"].forEach(ev=>slot.addEventListener(ev,e=>{e.preventDefault();slot.classList.remove("drag");}));
    slot.addEventListener("drop",e=>{ const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith("image/")) fileToData(f,setMain); });
    $("imgClear").onclick=()=>{ state.mainData=null; mainImg=null; syncSlot(null); save(); render(); };
  }
  function bindCanvasDrop(){
    const w=cv.parentElement;
    ["dragover","dragenter"].forEach(ev=>w.addEventListener(ev,e=>{e.preventDefault();w.classList.add("drag");}));
    w.addEventListener("dragleave",e=>{ if(e.target===w) w.classList.remove("drag"); });
    w.addEventListener("drop",e=>{ e.preventDefault(); w.classList.remove("drag");
      const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith("image/")) fileToData(f,setMain); });
  }
  function bindFields(){
    $("kicker").value=state.kicker; $("title").value=state.title; $("subtitle").value=state.subtitle;
    $("m1v").value=state.metrics[0]?.v||""; $("m1l").value=state.metrics[0]?.l||"";
    $("m2v").value=state.metrics[1]?.v||""; $("m2l").value=state.metrics[1]?.l||"";
    $("m3v").value=state.metrics[2]?.v||""; $("m3l").value=state.metrics[2]?.l||"";
    syncColors(); updateMeta();
  }
  function bindOnce(){
    const bt=(id,k)=>{ $(id).oninput=e=>{ state[k]=e.target.value; save(); render(); }; };
    bt("kicker","kicker"); bt("title","title"); bt("subtitle","subtitle");
    const bm=(idv,idl,i)=>{ const u=()=>{ state.metrics[i]={v:$(idv).value,l:$(idl).value}; save(); render(); }; $(idv).oninput=u; $(idl).oninput=u; };
    bm("m1v","m1l",0); bm("m2v","m2l",1); bm("m3v","m3l",2);
    bindColors(); bindImage(); bindCanvasDrop();
    $("resetColorsBtn").onclick=()=>{ state.colors=clone(PRESETS.royal); save(); syncColors(); buildPresets(); buildCards(); render(); };
    $("pngBtn").onclick=()=>exportImg("png");
    $("jpgBtn").onclick=()=>exportImg("jpeg");
    $("resetBtn").onclick=()=>{
      state=clone(DEFAULT); mainImg=null; templatesOpen=false;
      try{ localStorage.removeItem(KEY); }catch(e){}
      syncSlot(null); bindFields(); buildFormats(); buildPresets(); buildCards(); render();
    };
  }
  function updateMeta(){ const d=dims(); const f=FORMATS.find(f=>f.id===state.format); $("metaLine").textContent=d.w+" × "+d.h+" · "+(f?f.nm:""); }

  load();
  if(!templatesFor(state.format).some(t=>t.id===state.template)){
    const fallback=templatesFor(state.format)[0]||TEMPLATES[0];
    state.template=fallback.id;
  }
  bindFields(); bindOnce(); buildFormats(); buildPresets(); buildCards();
  if(state.mainData){ syncSlot(state.mainData); loadImg(state.mainData,im=>mainImg=im); }
  render();
  if(document.fonts&&document.fonts.ready){ document.fonts.ready.then(render); }
  setTimeout(render,400); setTimeout(render,1200);
  window.addEventListener("resize", render);
  return function cleanup() { window.removeEventListener("resize", render); };
}
