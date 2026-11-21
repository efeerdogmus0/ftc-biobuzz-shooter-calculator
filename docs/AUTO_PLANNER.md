# Oto planlayıcı

Bir robotun en hızlı BIOBUZZ otonomunu bulur. Sürüşü, sahayı, robotu ve puanlamayı **Probot Sim**'den (Tuna, `probot-studio/sim`), atışı bu uygulamanın fiziğinden alır.

Açmak için: yolculuk şeridinde **5 · Otonom** adımı (planlayıcı şeridin altında açılır), Uzman görünümünde **Araçlar → Oto planlayıcı…** (tam ekran).

## Nasıl çalışır (kullanıcı gözünden)

Düğme yok; her şey kendiliğinden hesaplanır.

1. **Robotu seç.** Varsayılan **Bu uygulamadaki robotum**: şasi ölçüleri, shooter ve Robot adımındaki sürüş tipi (Mecanum/holonomik ya da Tank) ile taret seçimi; planlayıcı bunları yeniden sormaz, buradaki seçiciler aynı değeri değiştirir. Builder robotu ya da robot dosyası da seçilebilir; onlarda shooter robottaki Probot modülü ya da bu uygulamadaki shooter.
2. **Maçı seç.** İttifak, başlangıç konumu, toplanacak POLLEN kaynakları, park.
3. **Atış haritası** önce kaba (40 cm), sonra seçilen aralıkta hesaplanır. Kaba harita biter bitmez ilk plan görünür; ince harita gelince plan yenilenir.
4. **Plan** her değişiklikten sonra arka planda (worker) yeniden aranır ve sahada oynatılır.
5. **2B fizik kontrolü** plan oturunca kendiliğinden koşar; 3B Rapier düğmeyle.

Ekran:

- **Saha (orta):** Robot planı sürer; toplar alınır, CELL'e uçar, HIVE devrilir, puan sayacı artar. Fizikte sürülen yol kesikli çizgiyle üstüne çizilir.
- **Zaman çizgisi:** Sürüş / toplama / atış / bekleme renkli. Fizikte tutmayan sürüşler kırmızı çerçeveli, devrilmeler `+20` bayraklı, 30. saniye çizgili. Tıkla ya da sürükle.
- **Klavye:** Boşluk oynat/durdur, ← → yarım saniye, Home başa.
- **Sonuç (sağ):** Puan ve dökümü, 30 saniyenin nereye gittiği, fizik kontrolü, koç, alternatif planlar, adımlar (tıklayınca o ana gider), **Planı kopyala** (zaman, koordinat, atış açısı ve RPM ile düz metin).
- **Ana uygulamaya geri:** Uygulama robotunda ilk CELL atışlarının yanında **Simülatörde göster** (robotu o noktaya koyar, açı ve RPM'i uygular, Atış adımına döner) ve **Atış noktalarına ekle** var. Başlıktaki etiket gerçek kalibrasyon rozetini gösterir ("Simülasyon · robotta ölçülmedi" / "Ölçümle kalibre edildi"); tıklayınca Robota aktar adımı açılır.
- **Koç:** Aynı saha, robotta tek bir şey değişmiş hâlde yeniden planlanır (ör. %50 fazla ivme, iki kat hızlı intake, taret). Kazanç puan ve saniye olarak yazılır; **Dene** değişikliği ayarlara yazar. Bu bir planlama sonucudur, ölçüm değil: ör. ivmeyi artırınca fizik kontrolünde tutan parça sayısı düşebilir (ölçüldü: 5/7 → 2/7).
- **Hatırlanır:** Seçimler `shooterlab.autoPlanner.v1`, atış haritaları shooter ayarına göre `localStorage`'da tutulur. Robot dosyası saklanmaz. **Sıfırla** varsayılana döner.
- Dar ekranda saha üstte, paneller altta; telefonda tek sütun.

## Kurulum: Probot Sim kaynakları (gizli)

`probot-studio/sim` gizli ve lisanssız; bu depo ise herkese açık. Bu yüzden Probot kodu bu depoya girmez:

- `vendor/probot-sim/` git'e girmez. İçine yalnız yerel bir klondan kopya alınır:
  ```bash
  gh repo clone probot-studio/sim ../probot-sim-ref -- --branch dev
  npm run probot:sync -- ../probot-sim-ref
  ```
- `vendor/probot-sim/KAYNAK.json`: kaynak commit ve her dosyanın sha256'sı.
- `probot-sim.lock.json`: planlayıcının en son derlendiği commit. Bu dosya depoya girer; içinde kod yok.
- Kopya yoksa uygulama yine derlenir. `virtual:auto-planner` (bkz. `probot-sim.config.ts`) "bu derlemede yok" ekranına gider; herkese açık pakette Probot kodu bulunmaz. Kopyasız derleme ve paket kontrol edildi (2026-11-03).
- Tip kontrolü: `npm run typecheck` Probot kodu olmadan, `npm run typecheck:auto` onunla birlikte çalışır.
- Testler: `src/auto/*.test.ts` yalnız kopya varken çalışır (`vitest.config.ts`).
- Probot Sim'in kullandığı tek dış paket `meshoptimizer` (MIT) bağımlılık olarak eklendi.

## Probot Sim'den kullanılanlar

Hepsi `src/auto/probot.ts` üzerinden geçer; Probot Sim değişince tek dosya etkilenir.

| Ne                                                         | Probot Sim dosyası                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Builder hazır robotları (Starter Bot, Omni şasi)           | `builder/kaynak.ts` + Builder çekirdeği                                                 |
| Builder'da açık proje, "Sim'de dene" robotu, robot dosyası | aynı                                                                                    |
| Sürüş modeli: teker, motor, tank/mecanum, ayak izi         | `robot/kinematik.ts`                                                                    |
| Rota ve hız profili (Road Runner benzeri)                  | `yol/rota.ts`                                                                           |
| Saha: başlangıçlar (G304), GARDEN, FLOWER, LOADING ZONE    | `saha/biobuzz.ts`                                                                       |
| Puan ve devrilme modeli                                    | `oyun/mac.ts`, `saha/biobuzz.ts` (değerler `planner.ts` içinde kopya, kaynak belirtili) |

Koordinatlar iki uygulamada aynıdır: saha merkezi orijin, +x mavi ittifak duvarı, +y seyirciden uzak, metre. Planlar mavi için yapılır; kırmızı, sahanın 180° döndürülmüş hâlidir.

## Robot ve shooter

- **Şasi:** Builder robotu seçilir. Boyut, sürüş tipi ve teker serbest hızı Probot Sim'in sürüş modelinden gelir. Azami hız varsayılanı serbest hızın %80'idir. Elle seçenek de var.
- **Shooter:** İki seçenek var.
  - **Builder'daki shooter:** Robotta `part-kit-shooter-modul` varsa "Probot Starter Bot shooter" kullanılır (`robot.ts`): 100 mm teker, sabit hood 65°, boşluk 68 mm. Bu ölçüler kit parçalarından; robotta ölçülmedi.
  - **Bu uygulamadaki robotum:** Kurulum sihirbazı ya da açık senaryodaki shooter.
- **"Kendi shooter'ımı kur…"** kurulum sihirbazını açar; sihirbaz bitince planlayıcıya geri dönülür.
- Her değer düzenlenebilir: azami hız, ivme, dönüş hızı, kapasite, yerden ve FLOWER'dan alma süresi, atışlar arası süre, shooter hızlanma süresi, taret.

## Atış haritası

- Izgara üzerindeki her robot merkezinde, bu uygulamanın **Otomatik çöz** çözücüsü isabet var mı ve kaç RPM gerektiğini bulur (`shotMap.ts`). Ana uygulamadaki top modeli (`ballModelSettings`) kullanılır ve önbellek anahtarına girer.
- Kayıtlı atış noktaları ızgaraya ek aday olarak eklenir.
- Taret yoksa şasi CELL'e çevrilir.
- İki harita hesaplanır:
  - ilk yukarı bakan CELL,
  - HIVE devrildikten sonra yukarı kalkan CELL (ilkinin HIVE pivot düzlemine göre aynası).
- Harita worker havuzunda hesaplanır ve shooter ayarına göre önbelleğe alınır.
- 25 cm ızgara bu makinede yaklaşık 16 saniye sürdü. Sonuç shooter ayarına göre tarayıcıda saklanır; aynı shooter için tekrar hesaplanmaz.

## Planlama (`planner.ts`)

- **Ne denenir:** Seçili kaynakların her alt kümesinin her sırası denenir (ön yük her zaman ilk); bir kaynağı bırakmak parkı süreye sığdırabilir. Robot kapasitesi kadar toplar, sonra atar.
- **Süre aşımı:** Plan 30 saniyeyi geçerse sonuçta kırmızı yazılır; süre sonrası adımlar puan almaz (ör. park 0).
- **Atış noktası:** Her atış için haritadaki noktalar arasından "gelme + sonraki hedefe gitme" süresi en kısa olan seçilir. Bu süreler Probot Sim rotalarıyla hesaplanır.
- **Devirten atış:** HIVE'ı deviren atış iki şekilde denenir: elindeki tüm topları atmak (fazla ağırlık beklemeyi kısaltır) ya da yetecek kadarını atıp kalanı sonraki CELL'e saklamak.
- **Sıralama:** Planlar önce puana, sonra son devirmenin zamanına, sonra bitiş zamanına göre sıralanır.
- **Sürüş:** HIVE çerçevesine giren düz yol, köşelerden dolaşan en kısa yolla değiştirilir. Her parça duruşla biter (Probot Sim `strafeTo` gibi), bu yüzden süreler spline'a göre biraz uzun çıkar.
- **Tank sürüş:** Önce döner, sonra düz gider; daha kısa olan yönde gerekirse geri gider.
- **Shooter:** Maç başında dönmeye başlar. Atış noktaları arasında RPM değişirse hızlanma süresiyle orantılı bekleme eklenir.
- **Puan (Probot Sim):** LEAVE 3 (otonom sonunda duvara değmiyorsa), AUTO PARK 5 (LOADING ZONE ile örtüşme), TIP 20.
- **Devrilme (Probot Sim, kaynak: Mona Shores ölçümü):**
  - CELL içi 0,19 kg'ı geçince devrilir.
  - Bekleme eşikte 2,5 sn; bir POLLEN fazla ağırlıkla 0,3 sn'ye iner. Salınım 0,75 sn.
  - İlk CELL'de 3 NECTAR var, bu yüzden 3 POLLEN eşiği geçer.
  - Modelde en fazla iki devirme var.

## Fizikte doğrulama (`verify.ts`)

**Ne yapılıyor:** Plan, Probot Sim'in fizik motorlarında BIOBUZZ sahasında (HIVE, FLOWER'lar, sahadaki toplar) sürülür.

- **2B planck:** hızlı.
- **3B Rapier:** tarayıcıda yaklaşık 5 sn.
- **Takipçi:** Holonomik robotlar Probot Sim'in kendi takipçisini (`surus/takip.ts`) kullanır. Tank sürüşte RAMSETE kullanılır, çünkü Probot Sim'in takipçisi yanal hatayı düzeltmiyor.
- **Ölçülenler:** Her sürüş parçası için en büyük sapma, varış konum hatası ve varış yön hatası.
- **Geçme eşiği:** sapma ≤ 0,35 m, varış ≤ 0,15 m, yön ≤ 20°.

**Dönme noktası:** Planlar robotu dönme noktasından konumlar. Tank sürüşte bu nokta tahrikli tekerlerin ortası, holonomikte ayak izinin merkezi. Probot Sim ise kök çerçeveyi takip eder; dönüşüm `rootPose` / `fromFootprint` ile yapılır.

- Starter Bot'un tahrikli aksı kökün 15 cm gerisinde. Bu düzeltme yapılmadan robot olduğu yerde dönerken kayıyor ve plan takip edilemiyordu.

**Doğrulamanın bulduğu ve düzeltilen sorunlar (2026-11-03/04):**

- Robot duvarın, GARDEN'ın ya da FLOWER'ın dibinde dönmeye çalışıyordu (köşesi süpürüyor). Artık son yaklaşma ve çıkış düz yapılıyor.
- Yol FLOWER'ların içinden geçiyordu. Artık FLOWER'lar da engel; ziyaret edilen FLOWER o parça için hariç tutuluyor.
- Park sırasında duvar dibinde dönüyordu. Park da düz girişle yapılıyor.

- Tank takipçisi (RAMSETE) dönme noktasında çalışıyor ve en küçük kazancı 8 1/s; yerinde dönüşte ve duruşta robotu bu tutuyor.
- Burundan girilen park, duvardan önce hizalanıp düz girişle yapılıyor.

**Ölçülen sonuçlar (2026-11-09, Starter Bot, mavi, seyirci duvarı başlangıcı):**

| Plan                                                | 2B                         | 3B Rapier                  |
| --------------------------------------------------- | -------------------------- | -------------------------- |
| Test planı (`verify.test.shared.ts`, yapay harita)  | 6/7, en büyük sapma 0,18 m | 7/7, en büyük sapma 0,19 m |
| Arayüz varsayılanı (gerçek shooter haritası, 25 cm) | 5/7, en büyük sapma 0,16 m | bu turda ölçülmedi         |

- 2B kontrol bu makinede yaklaşık 0,4 sn, 3B yaklaşık 3 sn sürdü.
- Arayüz varsayılanı 43 puan veriyor (TIP ×2 40 + LEAVE 3); park 30,8. saniyede bittiği için 0.
- Bu bir gerileme ölçüsü; "her plan fizikte tutuyor" iddiası değil.
- Gerçek robot kendi kontrolcüsünü (ör. Pedro Pathing) kullanacağı için asıl doğrulama sahada yapılmalı.

## Ölçülmeyenler ve bilinen sınırlar

- Puan tablosu, devrilme eşiği ve ön yükün robotun önünde durması (G304.G) Probot Sim'in okumaları; burada resmî kılavuzla tekrar doğrulanmadı. Ön yükün robotun içinde başladığı seçenek ayrıca var.
- Alma, atış arası ve hızlanma süreleri varsayılan tahminler; robotta ölçülüp girilmeli.
- İttifak ortağı, rakip robotlar ve topların sekmesi yok. Robotun yolda topa ya da FLOWER'a çarpması kontrol edilmiyor.
- Atış haritası durarak atışı modelliyor; hareket ederken atış yok.
- Doğrulama sürüşü kontrol eder; intake'in topu gerçekten alması ve atış fizikte koşturulmaz.
