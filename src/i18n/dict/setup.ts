import type { Pair } from ".";

// [Turkish, English]
// Start screen, guided setup, ReCalc import, Sandbox, layout choice, simple
// panel, motor explorer, setup fields and the mechanism schematic.
export const setup: readonly Pair[] = [
  // ---- Start screen
  ["Simülasyona dön", "Back to simulation"],
  ["Robotumu kur", "Set up my robot"],
  [
    "Adım adım; her ölçünün ne olduğu ve nasıl ölçüleceği yanında anlatılır. Yaklaşık 2 dakika.",
    "Step by step; each measurement is explained next to it, including how to measure it. About 2 minutes.",
  ],
  ["ReCalc'tan aktar", "Import from ReCalc"],
  [
    "ReCalc Flywheel'de Copy Link'e bas, buraya yapıştır; teker, hız ve oranlar kendiliğinden dolar.",
    "Press Copy Link in ReCalc Flywheel and paste it here; wheel, speed and ratios fill in automatically.",
  ],
  [
    "Kurulum yok. Hazır örnek robotlarla sahada serbestçe dene, atış yap, ayarları kurcala.",
    "No setup. Try ready-made example robots on the field, take shots, tweak the settings.",
  ],
  ["Dosyadan aç", "Open from file"],
  [
    "Daha önce dışa aktardığın bir profil (.json).",
    "A profile you exported earlier (.json).",
  ],
  ["Başla", "Start"],
  ["Aç", "Open"],
  [
    "BIOBUZZ 2026–27 · POLLEN ATIŞ SİMÜLATÖRÜ",
    "BIOBUZZ 2026–27 · POLLEN SHOT SIMULATOR",
  ],
  [
    "Shooter'ını kur, atışını sahada gör.",
    "Set up your shooter, see your shot on the field.",
  ],
  [
    "Saha, HIVE ve POLLEN her takım için aynıdır; shooter senin. Ölçülerini gir, simülatör topun nereye gideceğini ve isabet için hangi açı/RPM gerektiğini hesaplasın.",
    "The field, HIVE and POLLEN are the same for every team; the shooter is yours. Enter your measurements and the simulator works out where the ball goes and which angle/RPM it takes to score.",
  ],
  ["NASIL BAŞLAMAK İSTERSİN?", "HOW DO YOU WANT TO START?"],
  ["ROBOTLARIM", "MY ROBOTS"],
  [
    "Simülasyon bir modeldir: örnekler ve varsayılan katsayılar ölçülmemiştir. Gerçek atış ölçümlerinle Gelişmiş arayüz → Analiz → Ölçümle kalibrasyon bunları test eder. Paylaşım bağlantıları doğrudan açılır.",
    "The simulation is a model: the examples and default coefficients are not measured. Advanced layout → Analysis → Calibrate from measurements tests them against your real shot measurements. Share links open directly.",
  ],

  // ---- Sandbox
  ["Geri", "Back"],
  ["Bir örnek robot seç ve oyna.", "Pick an example robot and play."],
  [
    "Bu robotlar kimsenin gerçek robotu değil; yuvarlak sayılarla kurulmuş, ölçülmemiş ve isabete ayarlanmamış başlangıç noktaları. Sahada robotu sürükle, açıyı ve hızı değiştir, Otomatik çöz ile isabet bul.",
    "These are nobody's real robots: starting points built from round numbers, not measured and not tuned to score. Drag the robot on the field, change the angle and speed, and find a hit with Auto solve.",
  ],
  ["Sahaya çık", "Go to the field"],
  [
    "Sandbox robotu Robotlarım'a kendiliğinden eklenmez. Beğendiğin bir ayarı üstteki Kaydet ile saklayabilirsin.",
    "A Sandbox robot is not added to My robots automatically. Keep a setup you like with Save at the top.",
  ],
  [
    "Eşit hızlı iki teker; çıkış hızı teker yüzey hızına yakın, az spin.",
    "Two wheels at equal speed; exit speed close to the wheel surface speed, little spin.",
  ],
  [
    "Hood tekerlekleri de motorla döner; topa daha az geri spin verir.",
    "The hood rollers are powered too; less backspin on the ball.",
  ],
  [
    "En basit yapı: tek motor, top sabit hood'a sürtünür ve geri spin alır.",
    "The simplest build: one motor, the ball rubs on a fixed hood and picks up backspin.",
  ],

  // ---- Mechanisms (presets/factory.ts)
  ["Teker + tahrikli hood tekerlekleri", "Wheel + powered hood rollers"],
  [
    "Alttaki ana teker topu, motorla döndürülen hood tekerleklerine karşı sıkıştırır. Hood tekerlekleri ana tekere dişliyle bağlı ya da ayrı motorlu olabilir.",
    "The main wheel below compresses the ball against motor-driven hood rollers. The hood rollers can be geared to the main wheel or have their own motor.",
  ],
  ["Teker + sabit (dönmeyen) hood", "Wheel + fixed (non-rotating) hood"],
  [
    "Yalnız ana teker tahriklidir; top sabit bir hood yüzeyine sürtünerek çıkar ve geri spin alır. Serbest dönen (avara) hood tekerlekleri bu modelde YOK.",
    "Only the main wheel is powered; the ball rubs along a fixed hood surface and leaves with backspin. Free-spinning (idler) hood rollers are NOT in this model.",
  ],
  ["Karşılıklı iki teker", "Two opposed wheels"],
  [
    "Alt ve üst teker topu iki taraftan sıkıştırır. Yüzey hızları eşitse top az spinle teker yüzey hızına yakın çıkar.",
    "The bottom and top wheels compress the ball from both sides. With equal surface speeds the ball leaves with little spin, close to the wheel surface speed.",
  ],

  // ---- ReCalc import screen
  ["Pano boş görünüyor.", "The clipboard looks empty."],
  [
    "Tarayıcı panoyu okumaya izin vermedi. Kutuya tıklayıp ⌘V / Ctrl+V ile yapıştır.",
    "The browser did not allow reading the clipboard. Click the box and paste with ⌘V / Ctrl+V.",
  ],
  ["RECALC'TAN AKTAR", "IMPORT FROM RECALC"],
  ["ReCalc linkini yapıştır.", "Paste the ReCalc link."],
  [
    "{link} sayfasında shooter'ını gir.",
    "Enter your shooter on the {link} page.",
  ],
  [
    "Sağ üstteki <b>Copy Link</b> düğmesine bas.",
    "Press the <b>Copy Link</b> button at the top right.",
  ],
  [
    "Buraya yapıştır. Değerler aşağıda tabloya dökülür.",
    "Paste it here. The values are listed in the table below.",
  ],
  ["ReCalc linki", "ReCalc link"],
  ["Panodan yapıştır", "Paste from clipboard"],
  ["Alan", "Field"],
  ["Simülatörde", "In the simulator"],
  ["aktarıldı", "imported"],
  ["saklandı", "kept"],
  ["kullanılmadı", "not used"],
  ["Kuruluma devam et", "Continue to setup"],
  [
    "Link yalnız tarayıcında okunur; hiçbir yere gönderilmez. ReCalc ile bu simülatör farklı modeller kullanır, aynı ayarda çıkış hızları birebir tutmayabilir.",
    "The link is read only in your browser; it is not sent anywhere. ReCalc and this simulator use different models, so exit speeds may not match exactly for the same setup.",
  ],

  // ---- ReCalc messages (utils/recalc.ts)
  ["Link çok uzun; ReCalc linki değil.", "Link too long; not a ReCalc link."],
  [
    "Bu bir bağlantı değil. ReCalc'ta Copy Link ile kopyala.",
    "This is not a link. Copy it with Copy Link in ReCalc.",
  ],
  [
    "Bu link {host} adresine ait; ReCalc (reca.lc) linki bekleniyor.",
    "This link belongs to {host}; a ReCalc (reca.lc) link is expected.",
  ],
  [
    "Bu ReCalc linki flywheel hesaplayıcısına ait değil. ReCalc → Flywheel sayfasında Copy Link kullan.",
    "This ReCalc link is not from the flywheel calculator. Use Copy Link on the ReCalc → Flywheel page.",
  ],
  [
    "Linkte ayar yok. ReCalc'ta adres çubuğunu değil, Copy Link düğmesini kullan.",
    "The link has no settings. In ReCalc use the Copy Link button, not the address bar.",
  ],
  ["ReCalc alanı okunamadı: {key}.", "Could not read ReCalc field: {key}."],
  [
    'ReCalc alanı {key}: "{unit}" birimi tanınmıyor.',
    'ReCalc field {key}: unit "{unit}" is not recognised.',
  ],
  ["ReCalc oranı okunamadı: {key}.", "Could not read ReCalc ratio: {key}."],
  [
    "ReCalc shooter tipi tanınmıyor: {mode}.",
    "ReCalc shooter type not recognised: {mode}.",
  ],
  [
    "ReCalc'taki Compound (Single + Dual) shooter henüz kurulum sihirbazına aktarılamıyor. ReCalc'ta Single Shooter Wheel + Hood ya da Dual Shooter Wheel seçip linki yeniden kopyala.",
    "ReCalc's Compound (Single + Dual) shooter cannot be imported into the setup wizard yet. In ReCalc choose Single Shooter Wheel + Hood or Dual Shooter Wheel and copy the link again.",
  ],
  [
    "Linkte teker çapı veya hedef hız yok.",
    "The link has no wheel diameter or target speed.",
  ],
  [
    "ReCalc hedef hızı 1–20000 RPM aralığında değil.",
    "ReCalc target speed is not within 1–20000 RPM.",
  ],
  [
    "ReCalc teker çapı 10–300 mm aralığında değil.",
    "ReCalc wheel diameter is not within 10–300 mm.",
  ],
  [
    "ReCalc'taki top {ball}; BIOBUZZ POLLEN {pollen}. Atışlar POLLEN ile hesaplanır, bu yüzden çıkış hızı ReCalc'tan farklı olabilir.",
    "The ball in ReCalc is {ball}; the BIOBUZZ POLLEN is {pollen}. Shots are computed with POLLEN, so the exit speed may differ from ReCalc.",
  ],
  [
    "ReCalc'ta sıkışma (boşluk), çıkış yüksekliği ve hood açısı yok; bunları sonraki adımlarda sen gireceksin.",
    "ReCalc has no compression (gap), exit height or hood angle; you will enter them in the next steps.",
  ],
  // Import table rows
  ["Shooter tipi", "Shooter type"],
  ["Ana teker çapı", "Main wheel diameter"],
  ["Ana teker hedef hızı", "Main wheel target speed"],
  ["Ana teker ağırlık / atalet", "Main wheel mass / inertia"],
  ["Üst teker çapı", "Top wheel diameter"],
  ["Üst / alt teker hız oranı", "Top / bottom wheel speed ratio"],
  ["Üst teker ağırlık / atalet", "Top wheel mass / inertia"],
  ["Ek flywheel", "Extra flywheel"],
  ["Topun giriş hızı", "Ball feed speed"],
  ["Oyun parçası", "Game piece"],
  ["kapalı", "off"],
  ["yok", "none"],
  ["bilinmiyor", "unknown"],
  [
    "Kaydedilir; atış önizlemesi motor eğrisini kullanmaz",
    "Saved; the shot preview does not use the motor curve",
  ],
  ["→ üst teker", "→ top wheel"],
  ["disk ataleti", "disk inertia"],
  ["(özel)", "(custom)"],
  ["redüksiyon", "reduction"],
  ["hızlandırma", "step-up"],
  ["Genel örnek", "General example"],
  ["ReCalc'tan aktarıldı", "Imported from ReCalc"],

  // ---- Guided setup
  ["Mekanizma", "Mechanism"],
  ["Ana teker", "Main wheel"],
  ["Hood / üst teker", "Hood / top wheel"],
  ["Sıkışma ve yükseklik", "Compression and height"],
  ["Atış açısı", "Launch angle"],
  ["Özet", "Summary"],
  ["Robot kurulumu", "Robot setup"],
  ["KURULUMU DÜZENLE", "EDIT SETUP"],
  ["RECALC'TAN KURULUM", "SETUP FROM RECALC"],
  ["ROBOTUMU KUR", "SET UP MY ROBOT"],
  ["Üst teker", "Top wheel"],
  ["Vazgeç", "Cancel"],
  ["Adım {n} / {total}", "Step {n} of {total}"],
  ["Shooter'ın hangi yapıda?", "How is your shooter built?"],
  [
    "Topu fırlatan parçaların dizilişi. <b>Emin değilsen:</b> tek motorlu bir teker ve üstünde dönmeyen kavisli bir plaka varsa <i>sabit hood</i>; üstte motorla dönen hood tekerlekleri varsa <i>tahrikli hood</i>; topu iki taraftan iki teker sıkıştırıyorsa <i>karşılıklı iki teker</i>.",
    "The layout of the parts that launch the ball. <b>If you are not sure:</b> one motor-driven wheel with a curved non-rotating plate above it is a <i>fixed hood</i>; motor-driven hood rollers above it are a <i>powered hood</i>; two wheels squeezing the ball from both sides are <i>two opposed wheels</i>.",
  ],
  [
    "Mekanizma değişince shooter geometrisi yeniden oluşturulur; özel hood tekerleği konumların sıfırlanır.",
    "Changing the mechanism rebuilds the shooter geometry; your custom hood roller positions are reset.",
  ],
  [
    "Topa değen, motorla dönen ana teker. <b>Çap</b>: lastik dahil dış çap. <b>Hız</b>: tekerin kendi devri; motor devri değil. Motoru ve dişli oranını seçersen hızı biz hesaplarız.",
    "The motor-driven main wheel that touches the ball. <b>Diameter</b>: outer diameter including the tread. <b>Speed</b>: the wheel's own RPM, not the motor's. Pick the motor and gear ratio and we compute the speed.",
  ],
  ["Teker çapı", "Wheel diameter"],
  ["Yaygın çaplar", "Common diameters"],
  ["TEKER HIZI NASIL BELİRLENSİN?", "HOW SHOULD THE WHEEL SPEED BE SET?"],
  ["Teker hızı", "Wheel speed"],
  ["Motor ve dişli oranı", "Motor and gear ratio"],
  ["RPM'i biliyorum", "I know the RPM"],
  ["Sonra belirleyeceğim", "I'll decide later"],
  [
    "Motoru ve dişli oranını henüz seçmediysen, farklı seçeneklerin nasıl sonuç verdiğini incelemek ister misin?",
    "If you have not picked the motor and gear ratio yet, do you want to see how different options perform?",
  ],
  ["Sandbox'ta karşılaştır", "Compare in Sandbox"],
  [
    "Kurulumu geçici bir hızla bitir. Sahada, Basit arayüzdeki <i>Motor ve dişli</i> panelinde farklı motor ve oranların teker hızını ve isabeti yan yana gör.",
    "Finish the setup with a temporary speed. On the field, the <i>Motor and gear</i> panel of the Simple layout shows the wheel speed and hits for different motors and ratios side by side.",
  ],
  [
    "Kurulumun devam eder; geçici hız aşağıda.",
    "Your setup continues; the temporary speed is below.",
  ],
  ["ReCalc'ta incele", "Explore in ReCalc"],
  [
    "ReCalc motor tarafını hesaplar: hızlanma süresi, atış sonrası hız düşüşü, toparlanma. Teker ölçülerin ve POLLEN hazır gelir. Beğendiğin ayarı Copy Link ile kopyalayıp buraya yapıştır.",
    "ReCalc computes the motor side: spin-up time, speed drop after a shot, recovery. Your wheel dimensions and POLLEN come pre-filled. Copy the setup you like with Copy Link and paste it here.",
  ],
  ["ReCalc'ı aç", "Open ReCalc"],
  ["ReCalc linkini yapıştır", "Paste ReCalc link"],
  [
    "ReCalc'ta tahrikli hood yok; tek teker + hood olarak açılır.",
    "ReCalc has no powered hood; it opens as a single wheel + hood.",
  ],
  [
    "Şimdilik kullanılacak geçici teker hızı",
    "Temporary wheel speed to use for now",
  ],
  [
    "Sonra Basit arayüzde motor ve oran seçince değişir.",
    "Changes when you pick a motor and ratio in the Simple layout later.",
  ],
  ["Teker yüzey hızı", "Wheel surface speed"],
  [
    "= π × çap × RPM / 60. Topun çıkış hızı bu değere bağlıdır ama eşit değildir; kaymayı ve hood'u simülasyon hesaplar.",
    "= π × diameter × RPM / 60. The ball's exit speed depends on it but is not equal to it; the simulation accounts for slip and the hood.",
  ],
  [
    "Topun ana tekerin karşısında sürtündüğü hood. Sabit hood dönmez. Hood'unda <b>dönmeyen tekerlekler</b> varsa sayısını ve çapını gir. Düz/kavisli bir plakaysa simülatör onu birkaç dönmeyen tekerlekle yaklaşık modeller: varsayılanı bırakabilir, tam geometriyi Gelişmiş arayüzde düzenleyebilirsin. Serbest dönen (avara) tekerlekler bu modelde yok.",
    "The hood the ball rubs against opposite the main wheel. A fixed hood does not rotate. If your hood has <b>non-rotating rollers</b>, enter their count and diameter. If it is a flat/curved plate, the simulator approximates it with a few non-rotating rollers: you can keep the default and edit the exact geometry in the Advanced layout. Free-spinning (idler) rollers are not in this model.",
  ],
  [
    "Hood'daki motorla dönen tekerlekler. <b>Sayı</b> ve <b>çap</b>ı gir. Ana tekere dişli veya kayışla bağlıysa <b>oran</b> (hood tekerleği RPM ÷ ana teker RPM), ayrı motorluysa doğrudan <b>RPM</b>.",
    "The motor-driven rollers in the hood. Enter their <b>count</b> and <b>diameter</b>. If they are geared or belted to the main wheel, enter the <b>ratio</b> (hood roller RPM ÷ main wheel RPM); if they have their own motor, the <b>RPM</b> directly.",
  ],
  [
    "Topu üstten sıkıştıran ikinci teker. Ana tekere bağlıysa <b>oran</b> (üst RPM ÷ alt RPM), ayrı motorluysa <b>RPM</b>. Yüzey hızları eşitse top az spinle çıkar; farklıysa spin alır.",
    "The second wheel that compresses the ball from above. If it is linked to the main wheel, the <b>ratio</b> (top RPM ÷ bottom RPM); if it has its own motor, the <b>RPM</b>. Equal surface speeds give little spin; different speeds add spin.",
  ],
  ["Hood tekerlek sayısı", "Hood roller count"],
  ["Hood tekerlek çapı", "Hood roller diameter"],
  ["Tahrik", "Drive"],
  ["Ana tekere bağlı", "Linked to main wheel"],
  ["Ayrı motor", "Separate motor"],
  [
    "Hood tekerleği / ana teker RPM oranı",
    "Hood roller / main wheel RPM ratio",
  ],
  ["Üst / alt teker RPM oranı", "Top / bottom wheel RPM ratio"],
  ["Hood tekerlek hızı", "Hood roller speed"],
  ["Üst teker hızı", "Top wheel speed"],
  ["Sıkışma ve çıkış yüksekliği", "Compression and exit height"],
  [
    "<b>Boşluk</b>: ana teker ile karşı yüzey (hood ya da üst teker) arasındaki en dar mesafe. POLLEN {d} mm; boşluk daha dar olduğunda top sıkışır. <b>Sıkışma = POLLEN çapı − boşluk</b> ve iki tarafın toplamıdır. Kumpasla en dar noktadan ölç.",
    "<b>Gap</b>: the narrowest distance between the main wheel and the opposite surface (hood or top wheel). POLLEN is {d} mm; a narrower gap compresses the ball. <b>Compression = POLLEN diameter − gap</b>, the total of both sides. Measure at the narrowest point with calipers.",
  ],
  [
    "Teker ile karşı yüzey arası boşluk",
    "Gap between wheel and opposite surface",
  ],
  ["Toplam sıkışma", "Total compression"],
  [
    "Boşluk topa eşit veya geniş: top tekere bastırılmaz, kayar.",
    "Gap equal to or wider than the ball: the ball is not pressed against the wheel and slips.",
  ],
  [
    "Daha çok sıkışma daha iyi tutuş ama daha çok enerji kaybı demektir; gerçek değeri test et.",
    "More compression means better grip but more energy loss; test the real value.",
  ],
  ["Çıkış yüksekliği (yerden)", "Exit height (from the floor)"],
  [
    "Topun shooter'dan ayrıldığı noktanın zeminden yüksekliği.",
    "Height above the floor of the point where the ball leaves the shooter.",
  ],
  [
    "Topun çıkış yönünün yatayla yaptığı açı. Hood açın ayarlanabiliyorsa <b>min–max</b> aralığını gir: Otomatik çöz isabet ararken bu aralıkta kalır. Açı sabitse üçünü aynı yap.",
    "The angle between the ball's exit direction and the horizontal. If your hood angle is adjustable, enter the <b>min–max</b> range: Auto solve stays within it while searching for a hit. If the angle is fixed, set all three the same.",
  ],
  ["Şu anki açı", "Current angle"],
  ["En düşük", "Minimum"],
  ["En yüksek", "Maximum"],
  ["Değişiklikleri uygula", "Apply changes"],
  ["Son kontrol", "Final check"],
  ["Robot adı", "Robot name"],
  ["{n} × {d} mm tekerlek", "{n} × {d} mm rollers"],
  ["oran {r}:1", "ratio {r}:1"],
  ["Boşluk / yükseklik", "Gap / height"],
  ["Açı", "Angle"],
  ["MODEL VARSAYIMLARI (ÖLÇÜLMEDİ)", "MODEL ASSUMPTIONS (NOT MEASURED)"],
  [
    "Teker–top sürtünmesi 0,65 ve temas sertlikleri tahminidir.",
    "Wheel–ball friction 0.65 and the contact stiffnesses are estimates.",
  ],
  ["Teker ataleti ReCalc'tan alındı.", "Wheel inertia taken from ReCalc."],
  [
    "Teker ataleti bilinmiyor: atış sonrası hız düşüşü hesaplanmaz.",
    "Wheel inertia unknown: the speed drop after a shot is not computed.",
  ],
  [
    "Hava direnci Cd 0,47 ve Magnus eğimi 0,6: genel küre değerleri.",
    "Drag Cd 0.47 and Magnus slope 0.6: generic sphere values.",
  ],
  [
    "Hood temas yerleşimi tipik bir hood'dan türetilir; tam geometriyi Gelişmiş arayüzde düzenleyebilirsin.",
    "The hood contact layout is derived from a typical hood; you can edit the exact geometry in the Advanced layout.",
  ],
  [
    "Uygula yalnız değiştirdiğin alanları uygular; robot konumu, POLLEN, sekme ayarları, ölçülmüş ataletler ve kalibrasyon ölçümlerin korunur.",
    "Apply only applies the fields you changed; robot position, POLLEN, bounce settings, measured inertias and your calibration measurements are kept.",
  ],
  [
    "Bazı adımlarda düzeltilmesi gereken değer var (soldaki ! işaretli adımlar).",
    "Some steps have values to fix (the steps marked ! on the left).",
  ],
  ["Önceki", "Previous"],
  ["Uygula", "Apply"],
  ["Robotu oluştur ve sahaya çık", "Create the robot and go to the field"],
  ["İleri", "Next"],
  ["Canlı şema", "Live schematic"],
  ["CANLI ŞEMA · YAN GÖRÜNÜM", "LIVE SCHEMATIC · SIDE VIEW"],
  [
    "Ölçekli şematik çizim; sen değer girdikçe güncellenir. Simülasyondaki temas geometrisi bunun ayrıntılı halidir.",
    "A to-scale schematic that updates as you enter values. The simulation's contact geometry is a detailed version of it.",
  ],
  // Validation (presets/factory.ts, presets/motors.ts)
  ["Bir ad gir.", "Enter a name."],
  ["En fazla 120 karakter.", "At most 120 characters."],
  ["10–300 mm olmalı.", "Must be 10–300 mm."],
  ["1–20000 RPM olmalı.", "Must be 1–20000 RPM."],
  ["1–4 arası tam sayı olmalı.", "Must be a whole number from 1 to 4."],
  ["5–200 mm olmalı.", "Must be 5–200 mm."],
  ["0,05–20 arası olmalı.", "Must be between 0.05 and 20."],
  ["1–50000 RPM olmalı.", "Must be 1–50000 RPM."],
  ["10–200 mm olmalı.", "Must be 10–200 mm."],
  ["50–2000 mm olmalı.", "Must be 50–2000 mm."],
  ["0–90° olmalı.", "Must be 0–90°."],
  ["Min ile max arasında olmalı.", "Must be between min and max."],
  ["1–16 arası tam sayı.", "Whole number from 1 to 16."],
  ["1–500 olmalı.", "Must be 1–500."],
  ["%10–100 olmalı.", "Must be 10–100%."],

  // ---- Layout choice
  ["Saha ve robotun büyük ekranda", "The field and your robot, large"],
  ["İSABET / ISKA sonucu düz Türkçe", "HIT / MISS result in plain English"],
  [
    "Otomatik çöz: tek tıkla isabet eden açı + RPM",
    "Auto solve: a scoring angle + RPM in one click",
  ],
  ["Motor ve dişli oranlarını karşılaştırma", "Compare motors and gear ratios"],
  ["Basit arayüzle başla", "Start with the Simple layout"],
  [
    "Model ağacı, telemetri ve atış geçmişi",
    "Model tree, telemetry and shot history",
  ],
  [
    "Fizik, saha, temas ve sekme ayarlarının tamamı",
    "All physics, field, contact and bounce settings",
  ],
  [
    "Kapsam haritası, Monte Carlo, ölçümle kalibrasyon",
    "Coverage map, Monte Carlo, calibration from measurements",
  ],
  [
    "Shooter kesiti ve hata ayıklama verisi",
    "Shooter cross-section and debug data",
  ],
  ["Gelişmiş arayüzle başla", "Start with the Advanced layout"],
  ["ROBOTUN HAZIR", "YOUR ROBOT IS READY"],
  ["Hangi arayüzü tercih edersin?", "Which layout do you prefer?"],
  [
    "İkisi de aynı robotu ve aynı fiziği kullanır; yalnız ekranda ne kadar şey gördüğün değişir. İstediğin zaman üst çubuktan değiştirebilirsin.",
    "Both use the same robot and the same physics; only how much you see on screen changes. You can switch any time from the top bar.",
  ],
  ["Basit arayüz", "Simple layout"],
  ["Gelişmiş arayüz", "Advanced layout"],

  // ---- Simple panel
  ["Top HIVE hücresine giriyor.", "The ball enters the HIVE cell."],
  [
    "Top hedefe girmiyor. Açıyı veya hızı değiştir ya da Otomatik çöz'ü dene.",
    "The ball does not go in. Change the angle or speed, or try Auto solve.",
  ],
  [
    "Top hücrenin kenarına sürtüyor; küçük bir hata ıskalatır.",
    "The ball clips the cell edge; a small error makes it miss.",
  ],
  [
    "Top hedefe girmeden bir yapıya çarpıyor.",
    "The ball hits a structure before reaching the target.",
  ],
  [
    "Top shooter'dan çıkamıyor: hız, sıkışma veya temas ayarlarını kontrol et.",
    "The ball cannot leave the shooter: check speed, compression or contact settings.",
  ],
  ["İSABET", "HIT"],
  ["ISKA", "MISS"],
  ["KENARA SÜRTÜYOR", "CLIPPED EDGE"],
  ["ÇARPIYOR", "HITS STRUCTURE"],
  ["ÇIKMIYOR", "NO EXIT"],
  ["hedefe {d} m", "{d} m to target"],
  ["Yeni ayarlar hesaplanıyor…", "Computing new settings…"],
  ["Çıkış hızı", "Exit speed"],
  ["En yüksek nokta", "Apex"],
  ["Hedef payı", "Target margin"],
  ["Aranıyor… %{p}", "Searching… {p}%"],
  [
    "Otomatik çöz: isabet eden açı + RPM bul",
    "Auto solve: find a scoring angle + RPM",
  ],
  [
    "Bu konumdan isabet eden ayarlar. Birine tıkla, robot ona geçsin:",
    "Settings that score from this position. Click one to apply it to the robot:",
  ],
  ["{c} mm pay", "{c} mm margin"],
  [
    'Bu konumdan isabet bulunamadı. Robotu hedefe yaklaştır veya açı aralığını Robotum → Kurulumu düzenle\'den genişlet. (Arama sınırlıdır; "bulunamadı" imkânsız demek değildir.)',
    'No hit found from this position. Move the robot closer to the target or widen the angle range in My robot → Edit setup. (The search is limited; "not found" does not mean impossible.)',
  ],
  ["Atış ayarları", "Shot settings"],
  ["Ana teker hızı", "Main wheel speed"],
  ["Hood tekerleği", "Hood roller"],
  ["Çıkış yüksekliği", "Exit height"],
  ["Robot konumu", "Robot position"],
  ["Taret'i HIVE'a çevir", "Aim turret at HIVE"],
  [
    "Robot sürüklenince otomatik nişan al",
    "Auto-aim when the robot is dragged",
  ],
  [
    "Sahada robotu sürükleyerek konumunu değiştir. Telemetri, fizik, saha ve kalibrasyon araçları için üstten <b>Gelişmiş arayüz</b>'e geç; ayarların korunur.",
    "Drag the robot on the field to move it. For telemetry, physics, field and calibration tools, switch to the <b>Advanced layout</b> at the top; your settings are kept.",
  ],

  // ---- Robot card
  ["Robotum", "My robot"],
  ["Örnek · ölçülmemiş", "Example · not measured"],
  ["Referans (kopya)", "Reference (copy)"],
  [
    "Compound / ReCalc modeli (Gelişmiş arayüzde düzenlenir)",
    "Compound / ReCalc model (edited in the Advanced layout)",
  ],
  [
    "Değişiklikler bu kopyada kalır; üstteki Kaydet ile Robotlarım'a eklenir.",
    "Changes stay in this copy; Save at the top adds it to My robots.",
  ],
  ["Kurulumu düzenle", "Edit setup"],
  ["Başka robot…", "Another robot…"],

  // ---- Motor explorer and motor picker
  [
    "Motor ve oran henüz seçilmedi; şu anki {rpm} RPM geçici. Aşağıda farklı seçenekleri karşılaştır, uygun olanı uygula.",
    "Motor and ratio not chosen yet; the current {rpm} RPM is temporary. Compare the options below and apply the one that fits.",
  ],
  ["Bu hızı uygula · {rpm} RPM", "Apply this speed · {rpm} RPM"],
  ["AYNI DİŞLİ ORANI VE %{pct} İLE", "WITH THE SAME GEAR RATIO AND {pct}%"],
  [
    "Bu konumdan isabet için en az ≈ <b>{rpm} RPM</b> gerekiyor (Otomatik çöz). Daha yüksek hız, açıyı ayarlayarak yine isabet ettirebilir: hızı uyguladıktan sonra Otomatik çöz'e tekrar bas.",
    "Scoring from this position needs at least ≈ <b>{rpm} RPM</b> (Auto solve). A higher speed can still score with a different angle: press Auto solve again after applying the speed.",
  ],
  [
    "İsabet için gereken hızı görmek için önce Otomatik çöz'e bas.",
    "Press Auto solve first to see the speed needed to score.",
  ],
  ["Teker RPM", "Wheel RPM"],
  ["yeter", "enough"],
  ["yetmez", "too slow"],
  [
    "Çalışma hızı / serbest hız. Satıra tıklayınca o motor seçilir. Bu tablo yalnız teker hızını karşılaştırır; hızlanma süresi ve atış sonrası hız düşüşü için ReCalc'a bak.",
    "Operating speed / free speed. Click a row to select that motor. This table only compares wheel speed; see ReCalc for spin-up time and the speed drop after a shot.",
  ],
  [
    "Bu teker ve motorla ReCalc'ta incele",
    "Explore this wheel and motor in ReCalc",
  ],
  ["REV HD Hex (redüktörsüz)", "REV HD Hex (no gearbox)"],
  [
    "Diğer: serbest hızı kendim gireceğim",
    "Other: I'll enter the free speed myself",
  ],
  ["ReCalc'ta yok", "Not in ReCalc"],
  ["adet", "pcs"],
  ["diş", "teeth"],
  ["{label} birimi", "{label} unit"],
  ["inç", "in"],
  ["Motorun serbest (yüksüz) hızı", "Motor free (no-load) speed"],
  ["Motor adedi (bu tekeri çeviren)", "Number of motors (driving this wheel)"],
  ["Motor tarafı dişli / kasnak", "Motor-side gear / pulley"],
  ["Teker tarafı dişli / kasnak", "Wheel-side gear / pulley"],
  [
    "Doğrudan bağlıysa ikisine de 1 yaz. Örnek: motorda 20 diş, tekerde 40 diş → teker motorun yarı hızında döner (2:1 redüksiyon).",
    "If directly coupled, enter 1 for both. Example: 20 teeth on the motor, 40 on the wheel → the wheel turns at half the motor speed (2:1 reduction).",
  ],
  [
    "Çalışma hızı (serbest hızın yüzdesi)",
    "Operating speed (percent of free speed)",
  ],
  [
    "Shooter tekeri yük altında serbest hızın altında döner; hız kontrolüyle hangi hızda çalıştıracağını sen seçersin. Gerçek değeri robotta ölç.",
    "Under load the shooter wheel spins below free speed; with velocity control you choose the speed it runs at. Measure the real value on the robot.",
  ],
  [
    "Motor serbest {free} RPM · {ratio} → teker en fazla {max} RPM, %{pct} ile {target} RPM. Üretici nominal değerleri; doğrula.",
    "Motor free speed {free} RPM · {ratio} → wheel at most {max} RPM; at {pct}% that is {target} RPM. Manufacturer nominal values; verify.",
  ],
  ["{r}:1 redüksiyon", "{r}:1 reduction"],
  ["1:{r} hızlandırma", "1:{r} step-up"],

  // ---- Mechanism schematic
  ["Shooter yan görünüm şeması", "Shooter side-view schematic"],
  [
    "Yüzey hızı {s} m/s · boşluk {g} mm · sıkışma {q} mm",
    "Surface speed {s} m/s · gap {g} mm · compression {q} mm",
  ],
];
