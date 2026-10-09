import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        UISceneConfiguration(name: "Default", sessionRole: session.role)
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = GameViewController()
        window.makeKeyAndVisible()
        self.window = window
        options.userActivities.forEach(open)
    }

    // A link to a game's page (pocketvibe.dev/game/<id>/) opens the game's page in the launcher.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        open(userActivity)
    }

    private func open(_ activity: NSUserActivity) {
        guard activity.activityType == NSUserActivityTypeBrowsingWeb, let url = activity.webpageURL else { return }
        let parts = url.pathComponents // ["/", "game", "<id>"]
        guard parts.count >= 3, parts[1] == "game" else { return }
        (window?.rootViewController as? GameViewController)?.openGame(parts[2])
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        Service.shared.resume()
    }
}
