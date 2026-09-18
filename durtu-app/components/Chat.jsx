'use client';
// Selin — kişisel concierge (TTS'li)
import { useEffect, useRef, useState } from 'react';
import { log } from '../lib/logger';

export default function Chat({ name }){
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const speakRef = useRef(true);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const greeted = useRef(false);

  useEffect(() => {
    const b = bodyRef.current;
    if(b) b.scrollTop = b.scrollHeight;
  }, [msgs, typing, open]);

  function speak(txt){
    if(!speakRef.current) return;
    try{
      if(!('speechSynthesis' in window)) return;
      const clean = txt.replace(/<[^>]+>/g, ' ').replace(new RegExp('["\'“”‘’]', 'g'), '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
      if(!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'tr-TR'; u.rate = 1.06; u.pitch = 1.22; u.volume = .9;
      const vs = speechSynthesis.getVoices();
      const tr = vs.find(v => /^tr/i.test(v.lang));
      if(tr) u.voice = tr;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (err) { log.ignorable('chat.persist', err); }
  }

  function toggle(){
    if(!open && !greeted.current){
      greeted.current = true;
      setOpen(true);
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const g = 'Merhaba ' + name + ', ben Selin. DÜRTÜ’ye hoş geldin — bu akşam nasıl hissediyorsun?';
        setMsgs(m => [...m, { who: 'them', html: g }]); speak(g);
      }, 700);
    } else setOpen(o => !o);
  }

  function replyFor(t){
    if(/teklif|bonus|dönüş|donus|free/.test(t))
      return 'Bugün sana özel tek bir teklif var: <b>Gates of Olympus’ta 50 ücretsiz dönüş</b>. Banner’lara boğulmayacaksın — burada her şey kişisel.';
    if(/etkinlik|turnuva|parti|cuma|çarşamba|carsamba|pazartesi/.test(t))
      return 'Bu hafta iki davet var: Çarşamba <b>Yüksek Bahis</b> turnuvası ve Cuma <b>Crash Night</b>. Yerini ayırmamı ister misin?';
    if(/limit|kayıp|kayip|bütçe|butce|ara/.test(t))
      return 'Dürüst olayım ' + name + ': haftalık bütçenin <b>%70’i</b> kullanılmış durumda. İstersen biraz ara verelim — karar senin; ben sadece ev sahibinim.';
    if(/aviator|crash|uçak|ucak/.test(t))
      return 'Aviator bu seçkideki tek crash oyunu — bilinçli bir seçim. Yukarıdan <b>“Uç”</b> deyip kokpite geçebilirsin.';
    if(/davet|arkadaş|arkadas|kod/.test(t))
      return '<b>3 davet hakkın</b> duruyor. Unutma: kimi içeri aldığın senin imzan sayılır. Seçici ol; Dürtü unutmaz.';
    if(/merhaba|selam|naber|nasılsın|nasilsin/.test(t))
      return 'İyiyim, sorduğun için teşekkürler. Bugün senin için üç şey hazırladım — hangisinden başlayalım?';
    if(/teşekkür|tesekkur|sağ ol|sagol/.test(t))
      return 'Rica ederim. DÜRTÜ’de kapı her zaman sana açık — iyi oyunlar. ✦';
    const fall = [
      'Bunu not aldım. Seçkiyi senin geçmişine göre tazeliyorum.',
      'Anladım. Başka bir şey var mı — oyun, etkinlik, bütçe?',
      'Dürtü seni dinliyor. Devam et.',
    ];
    return fall[Math.random() * fall.length | 0];
  }

  function send(text){
    const txt = (text ?? inputRef.current?.value ?? '').trim();
    if(!txt) return;
    if(inputRef.current) inputRef.current.value = '';
    setMsgs(m => [...m, { who: 'me', html: txt }]);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const r = replyFor(txt.toLowerCase());
      setMsgs(m => [...m, { who: 'them', html: r }]);
      speak(r);
    }, 700 + Math.random() * 700);
  }

  return (
    <>
      <button id="chatBtn" onClick={toggle} title="Selin — kişisel temsilcin">S</button>
      {open && (
        <div id="chatPanel">
          <div className="chat-head">
            <div className="cav">S</div>
            <div><b style={{ fontWeight: 500 }}>Selin</b><br />
              <small className="muted">
                <span className="dot"></span>Kişisel Temsilcin · çevrimiçi
              </small>
            </div>
            <button className="taglink" style={{ marginLeft: 'auto' }}
              onClick={() => { speakRef.current = !speakRef.current; setSpeakOn(speakRef.current); if(!speakRef.current && 'speechSynthesis' in window) speechSynthesis.cancel(); }}>
              {speakOn ? '🔈' : '🔇'}
            </button>
          </div>
          <div id="chatBody" ref={bodyRef}>
            {msgs.map((m, i) => m.who === 'me'
              ? <div key={i} className="msg me">{m.html}</div>
              : <div key={i} className="msg them" dangerouslySetInnerHTML={{ __html: m.html }} />)}
            {typing && <div className="msg them typing"><span></span><span></span><span></span></div>}
          </div>
          <div className="qreplies">
            <button onClick={() => send('Teklifim nedir?')}>Teklifim nedir?</button>
            <button onClick={() => send('Etkinlik var mı?')}>Etkinlik var mı?</button>
            <button onClick={() => send('Limitim ne durumda?')}>Limitim ne durumda?</button>
          </div>
          <div className="chat-in">
            <input ref={inputRef} placeholder="Selin’e yaz…" onKeyDown={e => e.key === 'Enter' && send()} />
            <button onClick={() => send()}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
