import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The app's version is the handheld app's (app/pocketvibe/config.json), so the
// two always ship as the same PocketVibe.
val repo = rootDir.parentFile
val appVersion = (JsonSlurper().parse(repo.resolve("app/pocketvibe/config.json")) as Map<*, *>)["version"] as String
val versionParts = appVersion.split('.').map { it.toInt() }

android {
    namespace = "dev.cobanov.pocketvibe"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.cobanov.pocketvibe"
        minSdk = 29
        targetSdk = 35
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        versionName = appVersion
    }

    // Releases are signed with the key android/release.sh hands over in the
    // environment; it never lives in the repository. Without it a release
    // build comes out unsigned.
    val keystore = System.getenv("POCKETVIBE_KEYSTORE")
    signingConfigs {
        create("release") {
            if (keystore != null) {
                storeFile = file(keystore)
                storePassword = System.getenv("POCKETVIBE_KEYSTORE_PASSWORD")
                keyAlias = "pocketvibe"
                keyPassword = System.getenv("POCKETVIBE_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/web"))
}

// The launcher and the game shell are the handheld app's own files, copied in
// at build time; the site's DejaVu fonts stand in for the handheld's. The
// games a new install starts with come from the folder release.sh fills
// (POCKETVIBE_BUNDLED); a build without it starts with an empty Library.
val bundled = System.getenv("POCKETVIBE_BUNDLED")
val copyWeb by tasks.registering(Sync::class) {
    from(repo.resolve("app/pocketvibe/launcher")) { into("launcher") }
    from(repo.resolve("app/pocketvibe/config.json"))
    from(repo.resolve("site/public/fonts")) {
        include("DejaVuSans.woff2", "DejaVuSans-Bold.woff2")
        into("fonts")
    }
    if (bundled != null) from(bundled) { include("*.zip"); into("bundled") }
    into(layout.buildDirectory.dir("generated/web"))
}

tasks.named("preBuild") { dependsOn(copyWeb) }
