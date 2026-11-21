# Probot Studio entegrasyon notları (yaşayan belge)

**Kime:** Bu simülatörü probotstudio.com'a taşıyacak geliştirici veya yapay zekâ.
**Durum:** Simülatör hâlâ geliştiriliyor. Bu dosya her özellik eklendiğinde güncellenir. En alttaki **Değişiklik günlüğü** neyin ne zaman eklendiğini gösterir.
**Son güncelleme:** 1 Kasım 2026.

Kural: Burada "doğrulandı" denen şeyler kaynağı okunarak ya da çalıştırılarak görüldü. "Bilinmiyor / karar bekliyor" denenleri tahminle doldurma; Probot ekibine (Tuna Gül) sor.

---

## 1. Ne taşınacak, nereye

- **Uygulama:** Vite 7 + React 19 + three.js / R3F + zustand. Statik derlenir; sunucu kodu yok.
- **Önerilen yol:** `https://probotstudio.com/shooter/`. Derleme: `VITE_BASE=/shooter/ npm run build` → `dist/`. Ayrıntılar `docs/DEPLOY_PROBOT.md`.
- **Hâlihazırda yayında olan önizleme:** GitHub Pages (`efeerdogmus0.github.io/ftc-biobuzz-shooter-calculator/`). probotstudio.com'a henüz hiçbir şey yüklenmedi; DNS/CNAME değişikliği yok.
- **Durum URL'de ve tarayıcıda:** Paylaşım bağlantısı `#s=1.<base64url(deflate)>`, sıfırlama `?reset` / `#reset`. Sunucu tarafında yönlendirme kuralı gerekmez.

## 2. Dil (TR / EN): Probot kuralı birebir uygulandı

Kaynak: canlı `https://probotstudio.com/brand/diller.js` ve `/brand/header.js` okundu (1 Kasım 2026).

| Probot sitesi                                                                    | Bu uygulama                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `?dil=en\|tr` sorgu parametresi                                                  | Aynı. `?lang=` de kabul edilir. Okunduktan sonra `history.replaceState` ile adresten silinir. |
| `localStorage["probot-dil"]`                                                     | Aynı anahtar okunur ve yazılır.                                                               |
| Çerez `probot_dil` (`Path=/; Max-Age=31536000; SameSite=Lax`, https'te `Secure`) | Aynı ad okunur ve yazılır. **Eksik:** `Secure` bayrağı henüz eklenmedi; taşırken ekle.        |
| `<html lang>`                                                                    | Dil değişince güncellenir.                                                                    |
| Header'daki `dil-sec` bağlantısı ("EN" / "TR")                                   | `ProbotNav` içinde aynı sınıf ve davranış: sayfayı yenilemeden dil değiştirir.                |

**Sonuç:** Aynı kökte (probotstudio.com) Probot'ta EN seçen ziyaretçi bu aracı otomatik EN açar; tersi de geçerli.

**Kod:**

- `src/i18n/index.ts`: `decideLang` sırası URL → localStorage → çerez → tarayıcı dili (`tr*` → tr, diğerleri → en).
  - **Karar bekliyor:** Probot'un `VARSAYILAN` değeri `diller.js` içinde. Tarayıcı dilini hiç kullanmıyorsa son adımı `VARSAYILAN` ile değiştir.
- `src/i18n/useT.ts`: React kancası. `t("metin")`, `t.f("{n} örnek", { n })`.
- `src/i18n/dict/*.ts`: `[Türkçe, İngilizce]` çiftleri. Arama iki yönlü: kaynak metin hangi dilde yazılmışsa öbür dile çevrilir; sözlükte yoksa kaynak metin görünür. Yaklaşık 1140 çift var.
  - `app.ts`: kabuk, menüler, hesap.
  - `controls.ts`: shooter/fizik/saha/sekiş panelleri.
  - `analysis.ts`: analiz, telemetri, fizik modeli.
  - `setup.ts`: başlangıç, kurulum, ReCalc, Sandbox, Basit panel.
- `src/components/Inputs.tsx`: `N`, `Select`, `Toggle`, `Section` etiketleri kendiliğinden çevrilir.

**Taşırken yapılacaklar:**

1. Kendi başlığımızı (`ProbotBrand` + `ProbotNav` + `AccountButton`) gerçek `<probot-header>` bileşeniyle değiştir. Docs sitesinin kalıbı:
   - `<script src="https://probotstudio.com/brand/header.js" defer>`
   - `<probot-header home="/" active="araclar" variant="static" tool="shooter" lang="tr|en" sabit>`
   - Builder'da görülen öznitelikler: `home="/" active="araclar" variant="static" tool="builder" lang="en" sabit`.
   - **Bilinmiyor:** `tool="shooter"` çipinin bileşende tanımlı olup olmadığı.
2. Header kendi dil düğmesiyle `?dil=` ekleyip sayfayı yeniden açıyor (`dilKarsiligi('/builder/', '', 'en') → '/builder/?dil=en'`). Bizim `detectLang` bunu zaten okuyor; ek iş gerekmez. Sayfa yeniden açılmadan değişen bir dil olayı varsa (`probot-dil` için `storage` olayı) `useStore.getState().setLang()` ile bağla.
3. Probot'un kendi sözlük sistemi (`/brand/dil/en.js`, `D.metin(anahtar, dil)`) anahtar tabanlı. Bizimki metin tabanlı. Birleştirmek zorunlu değil; istenirse `dict/*.ts` dosyaları anahtar–metin tablosuna dönüştürülebilir.
4. **Sitede uzun tire yok kuralı:** `probot-docs/STUDIO-NOTE.md`'de Tuna "sitede — yok" diyor. Arayüzde boş değer yer tutucusu olarak "—" kullanılıyor (sonuç kartı, tablolar). Taşırken "-" veya "yok" ile değiştirilmeli. Tarih aralıklarındaki "–" (2026–27) en dash'tir; karar Probot ekibinin.

**Çevrilmeyenler (bilerek):**

- Kullanıcı verisi: robot adları, motor adları, kayıtlı `origin.source`.
- Birimler ve özel adlar: POLLEN, HIVE, RPM, ReCalc.
- Fizik motorunun sayı içeren bazı uyarı metinleri.
- `aria-label`'ların çoğu: e2e test kancası olarak İngilizce kaldı. Erişilebilirlik için taşırken çevir ve testleri buna göre güncelle.

## 3. Hesaplar ve robot kaydetme (şu an MOCK)

**Şu anki durum:** Hesap yalnızca bir **demo**. Şifre yok; e-posta + ad ile "giriş" yapılıyor. Veriler yalnızca o tarayıcıda, `localStorage["probot-mock-db-v1"]` içinde. Arayüz bunu kullanıcıya açıkça söylüyor.

**Tek değiştirme noktası:** `src/services/index.ts` → `export const accountApi: AccountApi = createMockAccountApi(...)`. Bunu `AccountApi` arayüzünü uygulayan bir HTTP istemcisiyle değiştir. Arayüzün geri kalanı (`accountStore.ts`, `Account.tsx`) değişmeden çalışır.

**Sözleşme** (`src/services/accountApi.ts`) ve önerilen REST karşılığı:

| AccountApi                                                | Önerilen uç nokta                                                                         | Not                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSession()`                                            | `GET /api/oturum` → `{user:{id,email,displayName}}` veya 401                              | Probot header'ı `localStorage["probot-oturum"]`'u ("1"/"0") yalnızca **bayrak** olarak tutuyor (header.js satır ~437, "kişisel veri DEĞİL"). Oturumun kendisi sunucuda; kesin uç nokta **bilinmiyor**.                       |
| `signIn()`                                                | Uygulama içinde YOK                                                                       | Gerçek sitede `SignInDialog` yerine Probot girişine yönlendir. Header'daki hesap düğmesi `/shop/hesap` adresine gidiyor (canlı CSS'te görüldü). Dönüşte `?dönüş=/shooter/` benzeri bir parametre gerekiyorsa **bilinmiyor**. |
| `signOut()`                                               | Probot'un çıkışı                                                                          |                                                                                                                                                                                                                              |
| `listRobots()`                                            | `GET /api/shooter/robots` → `RobotSummary[]`                                              | En yeni güncellenen önce.                                                                                                                                                                                                    |
| `getRobot(id)`                                            | `GET /api/shooter/robots/:id` → `StoredRobot`                                             | Başkasının robotu da **404** dönmeli (varlığı sızdırmamak için).                                                                                                                                                             |
| `saveRobot({id?, baseVersion?, name, summary, scenario})` | `POST /api/shooter/robots` (yeni) · `PUT /api/shooter/robots/:id` + `If-Match: <version>` | Sürüm uyuşmazsa **409**. İstemci "Kopya olarak kaydet" önerir.                                                                                                                                                               |
| `deleteRobot(id)`                                         | `DELETE /api/shooter/robots/:id`                                                          |                                                                                                                                                                                                                              |

**Hata kodları:** `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `CONFLICT` (409), `INVALID` (400/422), `QUOTA` (413/429), `UNAVAILABLE` (5xx).

**Veri:**

- `StoredRobot = { id, ownerId, schema: "pollen-scenario@1", name, summary, scenario, version, createdAt, updatedAt }`.
- `scenario`, `captureScenario()` çıktısının birebir JSON'u.
- `summary` dilden bağımsız: `"<mekanizma-id> · <çap> mm · <RPM> RPM"`.
- Mock sınırları: kullanıcı başına 50 robot, robot başına 1 MiB.

**Sunucu doğrulaması:** Mock her kayıtta ve okumada `parseScenario` çalıştırıyor. Gerçek sunucu da şemayı doğrulamalı: ya `src/utils/scenario.ts` + `src/utils/config.ts` mantığını paylaş, ya da en azından boyut, tip ve sayıların sonlu olmasını kontrol et. İstemci okurken her durumda yeniden doğrulayacak.

**Güvenlik:**

- Mock'ta şifre yok ve kimlik bilgisi saklanmıyor (testle kontrol ediliyor).
- Gerçekte oturum çerezi HttpOnly + Secure + SameSite olmalı; durum değiştiren isteklerde CSRF koruması gerekiyor.

**Taşıma sırasında veri göçü:** Kullanıcının tarayıcıda kalan iki tür kaydı var: `pollen-profiles` ("Bu tarayıcıdaki robotlarım") ve mock DB'deki robotlar. İlk girişte "Bu tarayıcıdaki N robotu hesabına aktar?" önerisi eklenmeli. **Henüz yapılmadı.**

**Açık robotun takibi:** `accountStore.open = {id, version, scenarioId}`. Başka bir robot, dosya veya örnek açılınca `useStore.scenarioId` artar ve "Kaydet" eski kaydın üstüne yazamaz.

## 4. Tasarım: Probot Builder'a hizalı

- **Kaynak:** canlı `probotstudio.com/builder/` ölçüldü.
  - 44 px site başlığı.
  - 29 px beyaz menü çubuğu, alt çizgisi `rgba(0,0,0,.07)`.
  - 36 px araç çubuğu: düğmeler 29 px, 13 px/500, köşe 5,4 px, etkin düğme `#ff4500` zemin ve beyaz yazı.
  - Dock sekme çubuğu: zemin `#f7ede3`, etkin sekme beyaz ve altında `inset 0 -2px #ffb020`.
  - Tuval: `radial-gradient(120% 120% at 50% 0%, #fffdfb, #f7ede3 55%, #efdfd0)`.
  - Fontlar: Inter, Baloo 2, JetBrains Mono.
- **Kod:** `src/app/styles.css`, "Probot Studio Builder alignment" bölümü.
- Probot'un asıl token dosyaları (`ui/tokens.css`, `DESIGN.md`) sunucu deposunda. Bizim erişimimiz yok. Taşırken bizim değişkenleri (`--ink`, `--dock`, `--mist`, `--amber`, `--deep`) onlara eşle.
- Global alt bilgi: Probot'ta `<probot-footer>` (`ui/brand/footer.js`) var. Bizde alt bilgi yok; taşırken eklenebilir.

## 5. ReCalc bağlantısı (ağ isteği yok)

- **İçe aktarma** (`src/utils/recalc.ts`): Yalnızca `reca.lc/flywheel?...` bağlantısı. Biçim gerçek "Copy Link" çıktısından alındı: ölçüler `{"s":değer,"u":birim}`, oranlar `{"magnitude":m,"ratioType":"Reduction|Step-up"}`.
- **Dışa bağlantı** (`src/presets/motors.ts` → `recalcLinkFor`): Teker ölçüleri ve POLLEN (2,8 in, 25 g) dolu ReCalc açılır. Motor yalnızca ReCalc listesinde aynısı varsa eklenir (ör. "HD Hex"); goBILDA ReCalc'ta yok.
- **Doğrulanmamış yorum:** ReCalc'ta "A'dan B'ye Reduction m" = A, B'den m kat hızlı.

## 5b. Limelight / AprilTag görüşü

- **Dosyalar:**
  - `src/vision/aprilTags.ts`: 16 BIOBUZZ etiketi.
  - `src/vision/limelight.ts`: kamera ayarı, izdüşüm ve harita.
  - `src/workers/vision.worker.ts` ve `src/app/useVisionMap.ts`: haritayı arka planda hesaplar.
  - `src/components/LimelightPanel.tsx`: panel. Basit arayüzde bölüm, Gelişmiş'te "Limelight" sekmesi.
  - `src/scene/VisionOverlay.tsx`: 3B görünüm.
  - Testler: `src/tests/limelight.test.ts`.
- **Etiket kaynağı:** BIOBUZZ Kılavuzu Bölüm 9 TU04, 9.9, Şekil 9-15–9-17.
  - 36h11 ailesi, 3,25 in kare, her CELL'in düz alt yüzünde dörtlü küme.
  - ID 30–33 kırmızı uzak, 34–37 kırmızı seyirci tarafı, 38–41 mavi seyirci tarafı, 42–45 mavi uzak.
  - Saha çerçevesinde +Y seyircinin karşı tarafı.
  - Etiketler modeldeki HIVE duruşuna bağlı.
- **Kayıt:** `camera` alanı senaryoda (`Scenario.camera`), fizik `Config`'inin dışında; kalibrasyon damgasını etkilemez. Hesaba kaydetme, dosya ve paylaşım bağlantısı aynı yoldan taşır. Eski dosyalarda alan yok (`null`).
- **Varsayımlar (ölçülmedi):**
  - Limelight 3A görüş alanı 54,5° × 42° (üretici belgesi).
  - Etiketin okunması için en kısa kenar en az 15 px ve bakış açısı en fazla 70°. Kullanıcı ikisini de değiştirebilir.
  - Hesap yalnız geometri: bulanıklık, ışık, parlama, CELL kenarları ve diğer robotlar yok.
- **Probot tarafı:** Builder entegrasyonunda kamera, Builder parçası olarak gelirse konum ve açı oradan okunabilir. Katalogda Limelight parçası olup olmadığı kontrol edilmedi.

## 5c. Oto planlayıcı (Probot Sim ile ortak)

- **Ayrıntı:** `docs/AUTO_PLANNER.md`.
- **Probot Sim kaynakları:** `probot-studio/sim` (gizli) `vendor/probot-sim/` altına `npm run probot:sync` ile kopyalanır. Bu klasör git'e girmez; herkese açık derlemede planlayıcı yerine "bu derlemede yok" ekranı gelir.
- **Taşırken:** probotstudio.com'a taşınırken bu kopya yerine gerçek paket kullanılmalı (Probot Sim ve Builder çekirdeği). Bunun yolu Tuna'yla konuşulmalı: Probot Sim'in `kopyala.mjs` / yüzey artefakt sistemi ya da planlayıcının doğrudan Probot Sim'e taşınması.
- **Ortak koordinat çerçevesi:** merkez orijin, +x mavi duvar, +y seyirciden uzak, metre. Probot Sim ile aynı, dönüşüm gerekmiyor.
- **Robot kaynakları (Probot Sim ile aynı):**
  - Builder hazır robotları.
  - Builder'da açık proje (`probot-builder-autosave`).
  - "Sim'de dene" robotu (`probot-sim-robot`).
  - Robot dosyası.
- **Yeni bağımlılık:** `meshoptimizer` (Builder çekirdeği istiyor).

## 6. Tarayıcı depolama anahtarları

| Anahtar                           | İçerik                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| `pollen-active`                   | Etkin senaryo                                                 |
| `pollen-profiles`                 | Bu tarayıcıdaki robotlar                                      |
| `pollen-ui-mode`                  | `simple` / `advanced` (eski `easy`/`medium`/`hard` eşleniyor) |
| `pollen-setup-length-unit`        | Kurulumda son seçilen uzunluk birimi                          |
| `probot-dil` + çerez `probot_dil` | Dil (Probot ile ortak)                                        |
| `probot-mock-db-v1`               | Demo hesap veritabanı (gerçek API gelince kaldır)             |
| `shooterlab.autoPlanner.v1`       | Oto planlayıcı seçimleri                                      |
| `shooterlab.shotmaps.v1`          | Oto planlayıcı atış haritası önbelleği                        |

Probot'un kendi anahtarları (`probot-oturum`, `probot-consent`, `probot-egitim-rol`, `probot-builder-autosave`) okunmuyor ve yazılmıyor. **İstisna:** `probot-dil` bilerek ortak.

## 7. Probot kaynak kodu incelemesi (2 Kasım 2026, `probot-studio` dev @ `425728c`, yalnız okuma)

Bu bölüm §2–§4'teki "bilinmiyor" maddelerinin çoğunu kaynak koddan doğrular. Çelişki olursa **bu bölüm geçerlidir**.

### 7.1 Depolar ve kurallar

- **Depolar:**
  - Açık: `probot-core`, `probot-sdk`, `probot-docs`.
  - Özel: `probot-studio` (site monorepo: site, builder, blocks, sim, shop, accounts, eğitim), `sim`, `blocks`, `probot-egitim`.
- **Dallar** (`CLAUDE.md`):
  - `dev`: gövde, dev.probotstudio.com.
  - `staging`: yalnız PR + merge queue ile, `quality` yeşilse.
  - `prod`: yalnız Tuna onayıyla fast-forward.
  - `main` yok.
- **Branch ve commit:**
  - Dal adı `<tür>/<kapsam>-<konu>`, örneğin `feat/shooter-builder-export`.
  - Commit'ler İngilizce Conventional Commits; ajan commit'lerinde `Co-Authored-By`.
- **Dil kuralı:** Mühendislik metni İngilizce; kullanıcıya görünen metin Türkçe ve i18n/veri dosyalarında.
- **Yasaklar:**
  - em dash (U+2014) hiçbir yerde, yerine " - ";
  - "lehimsiz", "NFR" kelimeleri;
  - silme (`git mv` + `docs/arsiv/`);
  - prod/nginx/DNS işlemleri (yalnız runbook hazırlanır).
- **Sınırlar** (`npm run sinirlar`): Uygulamalar birbirinin kaynağını import etmez. Ortak kod `packages/` altına gider. Uygulamalar arası bağ yalnız yazılı sözleşmelerle kurulur: URL, postMessage, localStorage anahtarı (`docs/sozlesmeler/yayinlanmis-yollar.md`).
- **UI kontrolü:** 1440×900 ve 390×844 ekran görüntüsü.
- **Bizim kodda yapılacak:** em dash temizliği zorunlu (arayüzdeki "—" yer tutucuları ve sözlük metinleri). `dictionary-check` bunu yakalar.

### 7.2 Yeni araç olarak eklenme

- **Kurulum şekli:** Araçlar monorepodan ayrı depolara taşınıyor (blocks, sim ayrıldı; builder sırada). Ayrı depodaki araç sabitlenmiş bir GitHub Release artefaktı olarak gelir:
  - dosyalar: `<ad>-dist-vX.Y.Z.tgz` + `.sha256` + `yuzey.json`;
  - kilit: `packages/yuzeyler/kilit/`;
  - kurulum yeri: `apps/<ad>/dist`.

  **Öneri:** shooter kendi deposunda kalır ve bu yolla girer.

- **Derleme:** Vite `base=/shooter/` ve `probotI18n()` eklentisi (`@probot-studio/i18n/vite`).
- **Header:** `index.html` içine satır içi betikle `/brand/header.js` ve `/brand/devnote.js` yüklenir. `<probot-header home="/" active="araclar" variant="static" tool="shooter" lang=…>` (Builder `TopBar.tsx` kalıbı).
  - `tool="shooter"` rozetinin `header.js`'te tanımlı olması gerekebilir; dosya incelenen klonda yok, **bilinmiyor**.
- **Diğer kayıtlar:**
  - araç listesi: `/araclar` sayfası;
  - `docs/SITE-MAP.md` ve README servis tablosu;
  - `llms.txt` ve `gelistirici/shooter.md` (`docs/AGENT-ACCESS.md`).
- **Analitik:** PostHog yalnız sayım gönderir. `identify` yalnız çerez rızasıyla çalışır.

### 7.3 Dil (doğrulandı)

- **Kaynak:** `packages/i18n` (`docs/I18N-SOZLESME.md` v2).
- **Seçim sırası:** Uygulamalar önek kullanmaz. Sıra `?dil=` (bir kez yazılır, `replaceState` ile silinir) → `localStorage probot-dil` → çerez `probot_dil` (Path=/, 1 yıl, Lax). **Bizim uygulama birebir aynı.**
- **Farklar:**
  - Accept-Language ile yönlendirme yasak. Bizim son adım tarayıcı dili; Probot'ta varsayılan `tr`. Taşırken son adımı `tr` yap.
  - `?gomulu=1` gömülü modda kayıtlı tercih okunmaz.
- **Anahtar biçimi:** Anahtar Türkçe metnin kendisi; bizim sözlük modeli de böyle. Bağlam için `tc(bağlam, tr)` var.
- **Taşırken:**
  - `Surface` kapalı bir liste (`site|blocks|builder|sim|shop|egitim`); `shooter` eklenmeli ve `scripts/i18n-generate.mjs` çalıştırılmalı.
  - Sözlükler `src/i18n/en/` altında, tembel yükleme ile.
  - `loadTranslator` / `appLanguage(surface)` kullanılabilir. Bizim `dict/*.ts` çiftleri `[tr, en]` olduğu için doğrudan dönüştürülebilir.

### 7.4 Hesaplar (doğrulandı)

- **Kimlik kaynağı:** Tek kaynak Better Auth (`apps/accounts`, `/api/auth/*`), tek kök çerezle.
- **Oturum okuma:** Tarayıcıdan `GET /api/auth/get-session`. Dönen kullanıcı: `id, email, name, emailVerified, role, hesapTuru ('ogretmen'|'ogrenci'|null)`.
- **`probot-oturum`:** Yalnız UI bayrağı; yetki sinyali değil.
- **Giriş:** `/shop/hesap?returnTo=%2Fshooter%2F` (Builder yeni sekmede açıyor). `returnTo` yalnız güvenli yerel yol kabul eder. Bizim `SignInDialog` taşınırken bununla değişir.
- **Robot saklama:**
  - Genel bir kullanıcı-belge API'si **yok**. Tek örnek Builder'ın kendi deposu: `/builder-api/projeler`, `GET/POST`, `GET/PUT/PATCH/DELETE /:id`, paylaşım linki.
  - Sınırlar: 5 MB/proje, 50 proje, 50 MB/hesap.
  - Koşullar: doğrulanmış e-posta, izinli `Origin`, JSON gövde.
- **Sürüm çakışması:** `/builder-api/projeler`'de sürüm kontrolü / 409 **yok**. Bizim mock'taki iyimser kilit için ya küçük bir shooter servisi ya da ortak bir paket gerekiyor. Bu bir mimari karar; `docs/KARARLAR.md`'ye yazılmalı, karar Tuna'nın.
- **Güvenlik:** `docs/ACCOUNT-SECURITY.md`. Sahiplik sunucuda kontrol edilir; yalnız `X-Real-IP` güvenilir.

## 7b. Builder entegrasyonu (kaynak koddan)

**Proje biçimi:** `packages/builder-core/src/core/types.ts`.

- **Kök:** `ProjectData = { projectName, version:'1.0', parts: SerializedPart[], history?, assets? }`. three.js dünyası: **mm, Y yukarı, ön −Z**, zemin y=0.
- **Parça:** `SerializedPart = { id, type, position, rotation (Euler XYZ, rad), scale, lengthN?, widthN?, groupPath?, custom?, ebeveyn?, eklem?, kayis?, donanim?, sablon? }`.
- **İlişkiler:**
  - `eklem`: dönen eksen; dişli/kasnak oranı `bagli` içinde.
  - `kayis`: HTD5M kayış `{kasnaklar, disler, c}`.
  - `ebeveyn`: parent bağı.
- **Geçersiz parça:** Yüklemede `id`/`type` eksik parçalar atılır.

**Builder'a proje vermek, kullanıcının otomatik kaydını ezmeden** (eğitim gömme protokolü, `gomulu.ts`, `useGomuluMesaj.ts`):

1. Aynı kökte iframe: `/builder/?gomulu=1`. Bu modda `probot-builder-autosave` okunmaz ve yazılmaz.
2. Builder → `{kaynak:'probot-builder', tur:'hazir'}`.
3. Biz → `{kaynak:'probot-egitim', tur:'yukle', proje}`.
4. Builder her değişiklikten 500 ms sonra → `{tur:'durum', proje, ozet}`.

Sonuç: **çift yönlü canlı bağ mümkün.** Shooter parametresi değişince Builder'daki model güncellenir; Builder'da parça taşınınca simülatör yeniden hesaplar.

- **Uyarı:** `kaynak:'probot-egitim'` eğitim için tanımlı. Shooter için yeni bir `kaynak` değeri `packages/gomulu-protokol`'de sözleşme değişikliği ister; branch + Tuna kararı.
- Kalıcı kayıt için kullanıcıya "Builder'da yeni proje olarak kaydet" (`POST /builder-api/projeler`) sunulabilir.

**Özel plaka:** Builder'da `custom` parça tipi var: `ozel-ekstrud` (`ozelParca.ts`, `sketch.ts`).

- Biçim: `EkstrudSekli { dis, delikler[][], h, y0 }`, yani dış hat + delikler + kalınlık, mm.
- Yan plaka (teker mili, hood vidaları, motor yuvası delikleriyle) doğrudan bu biçimde üretilebilir.
- Builder'da DXF/SVG dışa aktarma yok. Lazer kesim için DXF'i biz üretmeliyiz.

**Şablonlar:** `packages/builder-core/src/core/robots.ts` (`ROBOT_TEMPLATES`, `PartSpec{type,pos,q|rot,lengthMm,group}`).

- Starter Bot'ta `group:'shooter'` alt sistemi var.
- Parçalar Onshape'ten betiklerle geliyor.

**Shooter parçaları ve Starter Bot shooter'ı:**

- **Shooter modülü:** `part-kit-shooter-modul`, Ø100 teker (çarpışma Ø100×64) + iki dahili HTD5M **32T** kasnak.
- **Hood:** `part-kit-pc-hood-v2`, 2 mm PC. Orta yüzey profili `primitifler.ts` `KAPUT_V2_ORTA`. Starter Bot yerleşiminde büküm, teker miline **≈119 mm eş merkezli** bir yay (agent türetmesi). Buradan:
  - boşluk ≈ 119 − 1 − 50 = **≈68 mm**, POLLEN 71,1 mm → toplam sıkışma **≈3 mm**;
  - çıkış yönü ≈ **65°**.

  Bunlar CAD ile doğrulanmadı.

- **Konum:** Teker mili y=215 mm (yerden), z=86,5.
- **Tahrik:**
  - zincir: REV HD Hex + UltraPlanetary 3:1 (`part-rev-41-1600-3-1`) → 30T:30T dişli → 32T kasnak → HTD5M-340 kayış (merkez 90 mm) → modülün 32T kasnağı;
  - oran: redüktör sonrası **1:1**;
  - devir: Katalogda motor devri **yok**. REV nominal HD Hex 6000 RPM, 3:1 kartuş; gerçek oran ve devir doğrulanmalı.
- **Hesap yardımcıları:**
  - Kayış: `kayis.ts` (`boyIcinMerkez`, `kayisBoyu`); HTD5M boyları 245…640 mm.
  - Kasnak: 25T ve 32T var (5HX/7HX).
  - Diş sayısı: `hareket.ts` `disBilgisi` parça adından okuyor.
- **Katalog boşlukları:**
  - motor devri ve torku;
  - `KIT-*`/`REV-*` kütleleri ve POLLEN kütlesi;
  - teker malzemesi, sertliği ve ataleti;
  - dişli modülü;
  - GT2 kasnak.
- **Not:** Katalogdaki `part-gobilda-2000-0025-0002` motor değil **servo**. goBILDA motoru `part-gobilda-5203-2402-0019`.

**Sim:**

- Builder'ın Sim'e verdiği `probot-robot` v1 biçimi (`ROBOT-SEMA.md`): REP-103, metre/radyan, eklem, kütle, çarpışma. **Shooter alanı yok.**
- Shooter fiziğini Sim'e taşımak ayrı bir iş.

## 8. Açık işler

- [ ] Gerçek `<probot-header>` ve `<probot-footer>` ile değiştirme (§2, §4)
- [ ] `AccountApi` için HTTP istemcisi ve Probot girişine yönlendirme (§3)
- [ ] Tarayıcıdaki robotları hesaba aktarma önerisi (§3)
- [ ] Dil çerezine `Secure` ekleme; `aria-label` çevirisi (§2)
- [ ] Uzun tire temizliği (§2)
- [ ] `VITE_BASE=/shooter/` ile derleme ve sunucuya yükleme (`DEPLOY_PROBOT.md`)

## Değişiklik günlüğü

- **2026-11-10 (2):** Basit arayüz sadeleşti, ilk girişte beş adımlı tur eklendi.
  - Yalnız arayüz; Probot tarafında değişiklik yok, Probot Sim'den bir şey kopyalanmadı.
  - Yeni depolama anahtarı: `pollen-tour-done` (tur bir kez gösterilir).
  - Basit arayüzde menü çubuğu yok; komutlar araç çubuğundaki "Daha fazla" menüsünde. Gömme yapılırsa üst satır yüksekliği 44 + 44 px.
- **2026-11-10:** Uygulama geneli UX/UI geçişi (yalnız arayüz; Probot tarafında değişiklik yok, Probot Sim'den yeni bir şey kopyalanmadı).
  - Basit arayüzde Otomatik çöz en iyi ayarı robota kendisi uyguluyor; uygulanan öneri işaretli.
  - Araç çubuğu dar ekranda taşmıyor; telefonda iki satır, tek sayfa kaydırma.
  - Kurulum sihirbazı: Önceki / İleri hep ekranda; telefonda adım şeridi yana kayıyor.
  - Bildirim balonu ortada, Atış yap düğmesinin üstünü kapatmıyor.
  - Hazır robot / motor adları İngilizce arayüzde çevriliyor.

- **2026-11-09:** Oto planlayıcı arayüzü baştan yazıldı (`docs/AUTO_PLANNER.md`).
  - Düğmesiz akış: harita, plan ve 2B fizik kontrolü kendiliğinden; sahada canlı oynatma, zaman çizgisi, koç, planı kopyalama.
  - Başlangıç ekranına giriş şeridi (yalnız Probot Sim'li derlemede görünür).
  - Yeni depolama anahtarları: `shooterlab.autoPlanner.v1` (seçimler) ve atış haritası önbelleği.
  - Probot tarafında değişiklik yok; Probot Sim'den yeni bir şey kopyalanmadı.

- **2026-11-04:** Oto planı Probot Sim fiziğinde doğrulanıyor (2B planck, 3B Rapier).
  - Probot Sim'den `src/fizik` de kopyalanıyor.
  - Yeni bağımlılıklar: `@dimforge/rapier3d-compat` 0.19.3 ve `planck` 1.4.2 (Probot Sim ile aynı sürümler).
  - Planlar dönme noktasına göre.
  - Tank sürüşte RAMSETE takipçisi kullanılıyor.
- **2026-11-03:** Oto planlayıcı eklendi (§5c, `docs/AUTO_PLANNER.md`).
  - Sürüş, robot, saha ve puan Probot Sim'den (dev @ 57bda31); atış bu uygulamanın fiziğinden.
  - Probot kaynakları gizli kopya olarak tutuluyor; herkese açık depoya girmiyor.
- **2026-11-03:** Limelight / AprilTag görüşü eklendi (§5b).
  - Robottaki kamera konumu ve açısı girilir.
  - Etiket başına "görüyor / neden görmüyor" listesi.
  - Üç modlu saha haritası: şu anki yön, HIVE'a dönük, her yön.
- **2026-11-02:** Probot kaynak kodu (dev @ 425728c) okundu.
  - Dil, hesap, araç ekleme ve Builder sözleşmeleri doğrulandı (§7, §7b).
  - Gömme protokolüyle çift yönlü Builder bağı ve `ozel-ekstrud` özel plaka yolu bulundu.
  - Starter Bot shooter ölçüleri çıkarıldı.
- **2026-11-01:** İlk sürüm.
  - TR/EN altyapısı (Probot `probot-dil` / `probot_dil` / `?dil=` kuralı) ve ~1140 çeviri çifti.
  - Mock hesap ve robot veritabanı (`AccountApi`).
  - Builder hizalı tasarım; tam ekran kurulum, ReCalc içe/dışa aktarma, Sandbox, Basit/Gelişmiş arayüz.
  - Motor + dişli oranı seçimi.

## Yolculuk omurgası (Faz 1, 10 Kasım 2026)

- Basit yerleşim artık 6 adımlı şerit: Robot · Atış · Saha · Güven · Otonom · Robota aktar (`src/app/journey.ts`, `src/components/JourneyRail.tsx`, `src/components/stages/*`).
- Store'a oturumluk `stage` alanı eklendi (kaydedilmez). `autoOpen` basit yerleşimde Adım 5 demek: planlayıcı şeridin altında gömülü açılır; Uzman görünümünde eskisi gibi tam ekran.
- `uiMode` anahtarı (`pollen-ui-mode`) ve değerleri değişmedi; araç çubuğunda iki düğme yerine tek "Uzman görünümü" anahtarı var.
- Kurulum sonrası "hangi arayüz" ekranı (`LayoutChoice`, `setupOpen: "layout"`) kaldırıldı.
- Otonom adımının "tamam" işareti yalnız `shooterlab.autoPlanner.v1` anahtarının varlığına bakar; planın geçerli olduğunu doğrulamaz.
- Yeni metinler `src/i18n/dict/journey.ts` içinde (TR/EN).

## Ortak model ve köprüler (Faz 2, 10 Kasım 2026)

- `ScenarioState`'e iki alan eklendi; profil, paylaşım linki ve hesap kaydıyla birlikte taşınır, eski kayıtlar boş/varsayılanla açılır:
  - `shotPoints: ShotPoint[]` (en çok 40): `{id, name, x, y, heading, omega, hoodAngle, clearance, source, reliability?}`. `source`: `manual | coverage | study | plan`.
  - `chassis: {drive: "holonomic" | "tank", turret: boolean}`. Sihirbazın Şasi adımında ve planlayıcıda aynı değer düzenlenir.
- Köprüler (`src/app/shotPoints.ts`): Atış kartında "Bu noktayı kaydet"; kapsama hücresine tıklayınca robot oraya gider ve hücrenin çözümü uygulanır; açı çalışmasında "Bu noktayı kullan"; Güven adımındaki Monte Carlo oranı robotun üzerinde durduğu noktaya yazılır; Limelight kuruluysa her noktada görülen etiket sayısı gösterilir.
- Nokta listesindeki mesafe, atış kartıyla aynı tanımdır: shooter çıkışından HIVE merkezine yer mesafesi (`distanceOf`).
- Oto planlayıcı:
  - Varsayılan robot "Bu uygulamadaki robotum" (şasi ölçüleri + shooter + `chassis`). Daha önce kaydedilmiş `shooterlab.autoPlanner.v1` durumu varsa o seçim korunur.
  - Atış haritası top modelini (`ballModelSettings(bounceSettings)`) kullanır; önbellek anahtarına shooter ve top modeli girer. Kayıtlı atış noktaları ızgaraya ek aday olarak eklenir.
  - Plan metni ve adım satırları atış açısını (`hoodAngle + hoodOffset`) ve teker RPM'ini yazar.
  - İlk CELL atışlarında "Simülatörde göster" ve "Atış noktalarına ekle" var. Devrilmiş CELL atışlarında yok (ana simülatör o hedefi göstermiyor).
  - Probot Sim fizik doğrulaması yalnız Builder robotu / robot dosyasıyla çalışır; uygulama robotunda kart bunu söyler.
  - Başlıktaki "Simülasyon · robotta ölçülmedi" etiketi basit bir bayrak; gerçek kalibrasyon rozeti Faz 3'te bağlanacak.
- Bilinen sınırlar: shooter değişince kayıtlı noktalar silinmez (açı/RPM eskimiş olabilir); kapsama haritası sayfa yenilenince kaybolur.

## Robota aktar ve kalibrasyon (Faz 3, 10 Kasım 2026)

- Yeni saf modüller (store yok, worker'da çalışır): `src/export/shotTable.ts` (noktalardan / mesafe taramasından tablo, CSV, FTC Java sınıfı, ara değer) ve `src/export/shotLog.ts` (robotta ölçülen atışlar, simülasyonla karşılaştırma, ölçüm satırına çevirme). İşler `src/workers/export.worker.ts` ve `src/export/useExportJobs.ts` ile ana iş parçacığı dışında.
- `src/app/placement.ts`: `placed` ve `distanceOf` store'suz modüle taşındı; `src/app/shotPoints.ts` aynı adlarla yeniden dışa aktarıyor.
- `ScenarioState.shotLog: LoggedShot[]` (en çok 100) profil/paylaşım/hesapla taşınır; eski kayıtlar boş listeyle açılır, bozuk satır atılır.
- Mesafe taraması tüm tabloda tek atış açısı kullanır (en çok mesafeden isabet veren); bunun için `solve()` isteğe bağlı 5. parametre `limit` aldı (varsayılan 8, fizik değişmedi).
- Kalibrasyon damgası `v2-`: robot pozu/hareketi ve atış komutu (teker hızları, hood açısı; bağlı ek makaralar) damgadan çıkarıldı. Saklanan satırlar pozlarını taşır (`bakeMeasurements`). `v1-` damgalı eski kayıtlar, eski damga hâlâ tutuyorsa App açılışında bir kez yükseltilir (`upgradeCalibration`). Profil ayrıştırıcı `v1-`/`v2-` kabul eder.
- Store'a oturumluk `measured` alanı eklendi (kaydedilmez): App rozet sonucunu yazar, oto planlayıcının başlık etiketi bunu okur.
- Basit görünümde "Çıkış hızlarıyla modeli düzelt" yalnız `transfer` (ReCalc) ya da `friction` (fiziksel) uydurur; sürükleme katsayısı çıkış hızından belirlenemez.
- Java çıktısı Android Studio JBR `javac` ile derlendi ve çalıştırıldı (yerel deneme); robotta çalıştırılmadı.
