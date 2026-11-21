// The six-stage journey: rail, stage panels and the tour's last stop.
import type { Pair } from ".";

export const journey: readonly Pair[] = [
  // Rail
  ["Robotum ne?", "What is my robot?"],
  ["Buradan girer mi?", "Does it go in from here?"],
  ["Nereden atabilirim?", "Where can I shoot from?"],
  ["Güven", "Trust"],
  ["Maçta tutar mı?", "Will it hold in a match?"],
  ["Otonom", "Auto"],
  ["30 saniyede ne yaparım?", "What do I do in 30 seconds?"],
  ["Robota aktar", "To the robot"],
  ["Koda ne yazacağım?", "What do I put in code?"],
  ["henüz yapılmadı", "not done yet"],
  ["tamam", "done"],
  ["dikkat", "needs attention"],
  ["Sıradaki adım", "Next step"],
  ["Uzman görünümü", "Expert view"],
  [
    "Uzman görünümü: model ağacı, telemetri, fizik ve hata ayıklama ile tam tezgâh. Ayarların korunur.",
    "Expert view: the full workbench with model tree, telemetry, physics and debugging. Your settings are kept.",
  ],
  [
    "Robot hazır. Şimdi Otomatik çöz'e bas.",
    "Robot ready. Now press Auto solve.",
  ],
  ["5 · Yol haritan", "5 · Your roadmap"],
  [
    "Soldan sağa altı adım: robotunu tanıt, atışı bul, sahayı tara, güvenilirliği ölç, otonomu planla, sayıları robota aktar. İstediğin adıma tıkla.",
    "Six steps, left to right: describe your robot, find the shot, scan the field, measure reliability, plan auto, take the numbers to the robot. Click any step.",
  ],
  // Robot
  [
    "Diğer bütün adımlar buradaki robotu kullanır. Ölçülerin değişirse önce burayı güncelle.",
    "Every other step uses the robot defined here. If your measurements change, update this first.",
  ],
  ["Shooter'ın yeri", "Shooter position"],
  ["Shooter açıklığını kontrol et…", "Check shooter clearance…"],
  [
    "Top tekerle hood arasından rahat geçiyor mu, mekanizma kesitinde bakar.",
    "Shows in a mechanism section whether the ball passes freely between wheel and hood.",
  ],
  // Shot
  [
    'Bu konumdan isabet bulunamadı. Robotu hedefe yaklaştır veya açı aralığını Robot adımındaki Kurulumu düzenle\'den genişlet. (Arama sınırlıdır; "bulunamadı" imkânsız demek değildir.)',
    'No hit found from this position. Move the robot closer or widen the angle range under Edit setup in the Robot step. (The search is bounded; "not found" does not mean impossible.)',
  ],
  // Field
  [
    "Robotun sahanın her noktasından atış yapmayı dener ve isabet bulduğu yerleri sahaya boyar.",
    "Tries a shot from every point of the field and paints the places where a hit was found.",
  ],
  ["Sahayı tara", "Scan the field"],
  ["Sahayı yeniden tara", "Scan the field again"],
  ["Saha taranıyor… %{p}", "Scanning the field… {p}%"],
  ["Durdur", "Stop"],
  ["Tarama sıklığı", "Scan spacing"],
  ["Hızlı · 30 cm", "Fast · 30 cm"],
  ["Normal · 20 cm", "Normal · 20 cm"],
  ["İnce · 10 cm (dakikalar sürebilir)", "Fine · 10 cm (may take minutes)"],
  [
    "sahanın bu kadarından isabet var ({n} / {total} nokta)",
    "of the field has a hit ({n} / {total} points)",
  ],
  ["Haritada göster", "Show on the map"],
  ["Girer mi / hedef payı", "Goes in / target margin"],
  ["Gereken atış açısı", "Required shot angle"],
  ["Gereken çıkış hızı", "Required exit speed"],
  ["Haritayı kaldır", "Remove the map"],
  [
    "Robotu değiştirdiğinde harita silinir; yeniden taraman gerekir.",
    "Changing the robot clears the map; scan again afterwards.",
  ],
  ["En iyi atış açısı", "Best shot angle"],
  [
    "Sabit hood'lu robotlar için: sahanın kurala uygun noktalarında hangi açı en çok yerden isabet veriyor?",
    "For fixed-hood robots: which angle hits from the most legal places on the field?",
  ],
  ["Atış açısı çalışmasını aç…", "Open the shot angle study…"],
  // Trust
  [
    "Gerçek robot her atışta biraz farklı atar. Aynı atışı küçük hatalarla yüzlerce kez dener, kaçının girdiğini sayar.",
    "A real robot shoots a little differently every time. This repeats the shot many times with small errors and counts how many go in.",
  ],
  ["Robotun ne kadar tutarlı?", "How consistent is your robot?"],
  ["Özenli", "Careful"],
  [
    "PID'li teker, sıkı mekanik, dikkatli hizalama",
    "Wheel under PID, tight mechanics, careful alignment",
  ],
  ["Normal", "Normal"],
  ["Tipik bir FTC robotu", "A typical FTC robot"],
  ["Kaba", "Rough"],
  [
    "Boşluklu mekanik, pil düşünce yavaşlayan teker",
    "Loose mechanics, wheel that slows as the battery drops",
  ],
  [
    "Özel toleranslar (aşağıda ayrıntılar)",
    "Custom tolerances (details below)",
  ],
  ["Deneniyor… %{p}", "Trying… {p}%"],
  ["{n} atış dene", "Try {n} shots"],
  ["{hits} / {count} atış girdi", "{hits} / {count} shots went in"],
  [
    "Çok güvenilir. Küçük hatalar bu atışı bozmuyor.",
    "Very reliable. Small errors do not spoil this shot.",
  ],
  [
    "Güvenilir. Maçta çoğu atış girer.",
    "Reliable. Most shots go in during a match.",
  ],
  [
    "Riskli. Hedef payı daha büyük bir açı / hız seç ya da HIVE'a yaklaş.",
    "Risky. Pick an angle / speed with more target margin, or move closer to the HIVE.",
  ],
  [
    "Güvenilmez. Bu ayar ancak şansla girer; Atış adımında başka bir çözüm seç.",
    "Unreliable. This setting only goes in by luck; pick another solution in the Shot step.",
  ],
  [
    "Bu, girişi ölçer; topun HIVE içinde kalmasını değil. Toleranslar tahmindir, robotunda ölçülmedi.",
    "This measures entry, not whether the ball stays in the HIVE. The tolerances are estimates, not measured on your robot.",
  ],
  [
    "Eski sonuç başka bir ayara aitti. Yeniden dene.",
    "The previous result was for other settings. Try again.",
  ],
  ["Toleranslar ve dağılım (ayrıntı)", "Tolerances and spread (detail)"],
  [
    "Sekiş: top girdikten sonra ne oluyor?",
    "Bounce: what happens after the ball enters?",
  ],
  [
    "Topun hücreye, duvara ve içerideki diğer toplara çarpıp nerede durduğunu hesaplar. Daha yavaştır.",
    "Computes how the ball hits the cell, the walls and the balls already inside, and where it stops. Slower.",
  ],
  // Export
  [
    "Simülasyon bir tahmindir. Robotunda birkaç atış ölç, buraya gir; model ölçümlerinle tutuyorsa sayılara güvenebilirsin.",
    "The simulation is a prediction. Measure a few shots on your robot and enter them here; if the model matches them, you can trust the numbers.",
  ],
  ["ÖLÇÜMLE DOĞRULANDI", "VERIFIED BY MEASUREMENT"],
  ["ÖLÇÜLMEDİ", "NOT MEASURED"],
  ["Ölçülen atışlarla kalibrasyon", "Calibration from measured shots"],
  ["Robotu paylaş", "Share the robot"],
  ["Profil dosyası indir", "Download profile file"],
  ["Bağlantı kopyala", "Copy link"],
  ["Bu noktayı kullan", "Use this point"],
  [
    "15 cm ile 45,7 cm (18 inç) arasında olmalı.",
    "Must be between 15 cm and 45.7 cm (18 in).",
  ],
  ["Şasi ve sürüş", "Chassis and drive"],
  [
    "Robotun yerdeki ayak izi ve nasıl sürüldüğü. Sahadaki robot çizimi, duvara ne kadar yaklaşabildiği ve <b>otonom planlayıcı</b> bu bilgiyi kullanır; planlayıcı sana bir daha sormaz.",
    "Your robot's footprint on the floor and how it drives. The robot drawn on the field, how close it can get to a wall and the <b>auto planner</b> all use this; the planner will not ask you again.",
  ],
  ["Boy (ileri yön)", "Length (forward)"],
  ["SÜRÜŞ TİPİ", "DRIVE TYPE"],
  ["Sürüş tipi", "Drive type"],
  ["Mecanum / holonomik", "Mecanum / holonomic"],
  [
    "Yana kayabilir: dönmeden her yöne gider. Mecanum, omni (X-drive) ve swerve bu gruptadır.",
    "Can strafe: moves in any direction without turning. Mecanum, omni (X-drive) and swerve belong here.",
  ],
  [
    "Yana kayamaz: önce döner, sonra düz gider. Normal lastikli 4 veya 6 tekerli şasiler.",
    "Cannot strafe: turns first, then drives straight. 4- or 6-wheel chassis with ordinary tyres.",
  ],
  ["TARET", "TURRET"],
  ["Yok: nişan için robot döner", "None: the robot turns to aim"],
  ["Var: shooter kendi döner", "Yes: the shooter turns by itself"],
  ["taretli", "with turret"],
  ["taretsiz", "no turret"],
  [
    "Haritada renkli bir kareye tıkla: robot oraya gider ve o noktanın açısı ile teker hızı uygulanır.",
    "Click a coloured square on the map: the robot goes there and that spot's angle and wheel speed are applied.",
  ],
  ["Atış noktaların", "Your shot points"],
  [
    "Henüz kayıtlı nokta yok. Atış adımında isabet bulunca “Bu noktayı kaydet”e bas ya da haritada bir kareye tıklayıp oradan kaydet. Otonom planı ve atış tablosu bu noktaları kullanır.",
    "No saved points yet. When you find a hit in the Shot step, press “Save this point”, or click a square on the map and save from there. The auto plan and the shot table use these points.",
  ],
  ["Nokta adı", "Point name"],
  [
    "Güven adımında ölçülen isabet oranı",
    "Hit rate measured in the Trust step",
  ],
  [
    "Limelight bu noktadan HIVE'a dönükken kaç AprilTag görüyor",
    "How many AprilTags the Limelight sees from this point while facing the HIVE",
  ],
  ["{n} etiket", "{n} tags"],
  ["etiket yok", "no tags"],
  ["Robotu bu noktaya götür", "Move the robot to this point"],
  ["Noktayı sil", "Delete point"],
  ["Atış noktası olarak kayıtlı: {name}", "Saved as a shot point: {name}"],
  [
    "En fazla 40 atış noktası kaydedilebilir.",
    "At most 40 shot points can be saved.",
  ],
  [
    "Bu konum ve ayar; Saha, Otonom ve Robota aktar adımlarında kullanılır.",
    "This position and setting are used in the Field, Auto and Export steps.",
  ],
  ["Bu noktayı kaydet", "Save this point"],
  // Robota aktar · shot table and measured shots
  [
    "Atış tablosunu robot koduna koy, sonra robotunla birkaç atış yap ve sonuçlarını buraya yaz. Simülasyon gerçek atışlarını tutturuyorsa sayılara güvenebilirsin.",
    "Put the shot table in your robot code, then take a few shots with the robot and log them here. If the simulation matches your real shots, you can trust the numbers.",
  ],
  [
    "Kalibrasyon: ölçülen çıkış hızlarıyla doğrulandı.",
    "Calibration: validated against measured exit speeds.",
  ],
  [
    "Simülasyon sonucu; robotta ölçülerek doğrulanmadı.",
    "Simulation result; not validated by measurements on the robot.",
  ],
  [
    "{n} ayrılmış ölçüm yeniden kontrol edildi.",
    "{n} held-out measurements re-checked.",
  ],
  [
    "Robotta {n} atış girildi; simülasyon {k} tanesinin sonucunu doğru tahmin etti.",
    "{n} shots logged on the robot; the simulation predicted the outcome of {k}.",
  ],
  [
    "Maçta kullanmadan önce gerçek robotta dene.",
    "Try it on the real robot before using it in a match.",
  ],
  [
    "Gerçek atışların: {k} / {n} tahmin tuttu.",
    "Your real shots: {k} / {n} predictions matched.",
  ],
  [
    "İleri düzey · ölçüm JSON'u ve parametreler",
    "Advanced · measurement JSON and parameters",
  ],
  ["Probot Shooter atış tablosu", "Probot Shooter shot table"],
  ["Nokta", "Point"],
  [
    "Shooter çıkışından HIVE merkezine yer mesafesi (m)",
    "Ground distance from shooter exit to HIVE centre (m)",
  ],
  ["Ana teker hızı (RPM)", "Main wheel speed (RPM)"],
  ["Atış açısı, yataydan (°)", "Launch angle above horizontal (°)"],
  ["Hedef payı (mm)", "Target margin (mm)"],
  ["Güven (%)", "Trust (%)"],
  [
    "Mesafe: shooter çıkışından HIVE merkezine yer mesafesi, metre.",
    "Distance: ground distance from the shooter exit to the HIVE centre, in metres.",
  ],
  [
    "Açı topun çıkış açısıdır, servo konumu değil; servo değerini kendi robotunda ölç.",
    "The angle is the ball's launch angle, not a servo position; measure the servo value on your own robot.",
  ],
  [
    "Satırlar arası doğrusal ara değer; tablo dışında ilk/son satır kullanılır.",
    "Linear interpolation between rows; outside the table the first/last row is used.",
  ],
  ["Atış tablosu", "Shot table"],
  ["Atış noktalarım ({n})", "My shot points ({n})"],
  ["Mesafe taraması", "Distance sweep"],
  [
    "Henüz kayıtlı nokta yok. Saha adımında nokta kaydet ya da mesafe taramasını kullan.",
    "No saved points yet. Save points in the Field step or use the distance sweep.",
  ],
  ["En yakın (m)", "Nearest (m)"],
  ["En uzak (m)", "Farthest (m)"],
  ["Adım (m)", "Step (m)"],
  ["Mesafeler çözülüyor… %{p}", "Solving distances… {p}%"],
  ["Yeniden tara", "Sweep again"],
  ["Mesafeleri tara", "Sweep distances"],
  ["Mesafe gir", "Enter distance"],
  [
    "Robot kodu da aynı ara değeri hesaplar.",
    "The robot code computes the same interpolation.",
  ],
  ["Java'yı kopyala", "Copy Java"],
  ["Yazdır", "Print"],
  [
    "Java dosyası yalnız tabloyu ve ara değer fonksiyonunu içerir; motor ve servo adlarını kendi kodunda kullan. Mesafeyi Limelight ya da odometriden al.",
    "The Java file contains only the table and the interpolation function; use your own motor and servo names in your code. Take the distance from the Limelight or odometry.",
  ],
  ["Robotta ölçülen atışlar", "Shots measured on the robot"],
  [
    "Robotunla atış yap ve her atışı bir satır olarak gir: nereden attın, hangi RPM ve açıyla, top ne yaptı. Simülasyon her satırı aynı ayarla dener ve sonucu yan yana koyar.",
    "Shoot with your robot and enter each shot as a row: where you shot from, with which RPM and angle, and what the ball did. The simulation tries every row with the same settings and shows the result next to it.",
  ],
  ["Nereden attın?", "Where did you shoot from?"],
  ["Robotun şu anki konumu", "The robot's current position"],
  ["Atış ekle", "Add shot"],
  ["Top ne yaptı?", "What did the ball do?"],
  [
    "İsteğe bağlı: ağır çekim videodan ölç",
    "Optional: measure from slow-motion video",
  ],
  ["Teker hızı (RPM)", "Wheel speed (RPM)"],
  ["Atış açısı (°)", "Launch angle (°)"],
  ["Simüle edilen çıkış hızı {v} m/s", "Simulated exit speed {v} m/s"],
  ["Satırı sil", "Delete row"],
  [
    "Modeli robotuna göre düzeltmek için en az 3 atışta çıkış hızını gir (şu an {n}). Her üçüncü atış kontrol için ayrılır.",
    "To tune the model to your robot, enter the exit speed for at least 3 shots (now {n}). Every third shot is held out as a check.",
  ],
  [
    "{n} atışta çıkış hızı var. Model bunların çoğuna göre düzeltilir, her üçüncüsüyle kontrol edilir.",
    "{n} shots have an exit speed. The model is tuned on most of them and checked against every third.",
  ],
  ["Çıkış hızlarıyla modeli düzelt", "Tune the model with exit speeds"],
  ["Kontrol atışları tuttu.", "The check shots matched."],
  ["Kontrol atışları tutmadı.", "The check shots did not match."],
  [
    "Ortalama hata (normalize): düzeltme {train} · kontrol {val}. 1'in altı iyi.",
    "Average error (normalised): tuning {train} · check {val}. Below 1 is good.",
  ],
  ["Düzeltmeyi robota uygula", "Apply the tuning to the robot"],
  ["Girdi", "Went in"],
  ["Kısa kaldı", "Fell short"],
  ["Uzun gitti", "Went long"],
  ["Kenara çarptı", "Hit the rim"],
  ["Çıkmadı", "Did not leave"],
  ["Simülasyon · ölçümle doğrulandı", "Simulation · validated by measurement"],
  [
    "Robota aktar adımında ölçümlerini gör",
    "See your measurements in the To the robot step",
  ],
  [
    "Robot, taramayı başlattığın anda durduğu yönde HIVE'dan uzaklaşarak her adımda yeniden çözülür. Tüm tabloda tek atış açısı kullanılır, yalnız teker hızı değişir; böylece robotun ara değeri de gerçek bir çözüm üzerinde kalır.",
    "The robot backs away from the HIVE in the direction it stood when you started the sweep and is solved again at each step. The whole table uses one launch angle and only the wheel speed changes, so the robot's interpolation stays on a real solution too.",
  ],
  [
    "Bu doğrultuda hiçbir mesafede isabet bulunamadı.",
    "No hit found at any distance in this direction.",
  ],
  [
    "Seçilen açı {a}°: en çok mesafeden isabet veren açı.",
    "Chosen angle {a}°: the angle that scores from the most distances.",
  ],
  [
    "{n} adım sahaya ya da HIVE'a çarptığı için atlandı.",
    "{n} steps were skipped because the robot would leave the field or hit the HIVE.",
  ],
  [
    "Bu açıyla {n} mesafede isabet yok: {d} m.",
    "No hit at this angle from {n} distances: {d} m.",
  ],
  [
    "Bu satırlarda farklı atış açıları var. İki satırın arasındaki bir mesafe için robot iki farklı atışın ortasını kullanır ve ıskalayabilir. Ara değer kullanacaksan mesafe taramasını (tek açı) seç ya da noktalarını aynı açıyla kaydet.",
    "These rows use different launch angles. For a distance between two rows the robot uses the midpoint of two different shots and may miss. If you use interpolation, choose the distance sweep (one angle) or save your points with the same angle.",
  ],
  ["Simülasyon: {o}", "Simulation: {o}"],
  ["isteğe bağlı", "optional"],
];
