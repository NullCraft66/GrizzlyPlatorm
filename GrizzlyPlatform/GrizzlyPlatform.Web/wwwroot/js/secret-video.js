window.grizzlyPlaySecretVideo = (dotNetReference) => {
    const host = document.getElementById("secret-video-host");
    if (!host) return;

    host.innerHTML = '<div id="secret-youtube-player"></div>';

    const createPlayer = () => {
        new YT.Player("secret-youtube-player", {
            videoId: "RfiQYRn7fBg",
            playerVars: {
                autoplay: 1,
                controls: 1,
                rel: 0,
                modestbranding: 1
            },
            events: {
                onStateChange: (event) => {
                    if (event.data === YT.PlayerState.ENDED) {
                        dotNetReference.invokeMethodAsync("VideoFinished");
                    }
                }
            }
        });
    };

    if (window.YT && window.YT.Player) {
        createPlayer();
        return;
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
        if (previousReady) previousReady();
        createPlayer();
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
    }
};
