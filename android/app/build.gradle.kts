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

    buildTypes {
        release {
            isMinifyEnabled = false
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
// at build time; the site's DejaVu fonts stand in for the handheld's.
val copyWeb by tasks.registering(Sync::class) {
    from(repo.resolve("app/pocketvibe/launcher")) { into("launcher") }
    from(repo.resolve("app/pocketvibe/config.json"))
    from(repo.resolve("site/public/fonts")) {
        include("DejaVuSans.woff2", "DejaVuSans-Bold.woff2")
        into("fonts")
    }
    into(layout.buildDirectory.dir("generated/web"))
}

tasks.named("preBuild") { dependsOn(copyWeb) }
