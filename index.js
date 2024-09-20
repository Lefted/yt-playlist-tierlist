let player;
let currentVideoIndex = 0;
let videos = [];

// Include the function fetchPlaylistVideos here or import it if it's in a separate file
// Function to fetch all videos from a YouTube playlist
async function fetchPlaylistVideos(playlistId) {
  const API_KEY = document.getElementById("apiKey").value;
  if (!API_KEY) {
    alert("Please enter a valid YouTube API key.");
    return;
  }

  const baseUrl = "https://www.googleapis.com/youtube/v3/playlistItems";
  let allVideos = [];
  let nextPageToken = "";

  try {
    do {
      // Construct the API URL with the required parameters
      const url = `${baseUrl}?part=snippet&maxResults=50&playlistId=${playlistId}&key=${API_KEY}&pageToken=${nextPageToken}`;

      // Fetch the response from the YouTube API
      const response = await fetch(url);
      const data = await response.json();

      if (data.error && data.error.errors[0].reason === "quotaExceeded") {
        alert("API quota exceeded. Please try again later.");
        return;
      }

      // Extract the video details needed to embed in a player
      const videos = data.items.map((item) => ({
        videoId: item.snippet.resourceId.videoId,
        title: item?.snippet?.title,
        description: item?.snippet?.description,
        thumbnailStandard: item?.snippet?.thumbnails?.standard?.url,
        thumbnailHigh: item?.snippet?.thumbnails?.high?.url,
        duration: item?.contentDetails?.duration,
        rating: null,
      }));

      // Append the current batch of videos to the full list
      allVideos = allVideos.concat(videos);

      // Update the nextPageToken to get the next set of results
      nextPageToken = data.nextPageToken || "";
    } while (nextPageToken);

    return allVideos;
  } catch (error) {
    console.error("Error fetching playlist videos:", error);
  }
}

async function fetchAndDisplayVideosViaPlaylistId() {
  const playlistId = document.getElementById("playlistId").value;
  if (!playlistId) {
    alert("Please enter a playlist ID.");
    return;
  }

  loadVideosFromLocalStorage(playlistId);
  updateVideoList();
  setupPlayerWithFirstPossibleVideo();
}

async function continueLastSessionAndDisplayVideos() {
  if (localStorage.length === 0) {
    alert("No saved data found in local storage.");
    return;
  }

  const savedVideos = await getFirstKeyFromLocalStorageOrNull();
  if (!savedVideos) {
    alert("No playlist ID found in local storage.");
    return;
  }
  loadVideosFromLocalStorage(savedVideos);

  setupPlayerWithFirstPossibleVideo();
}

async function getFirstKeyFromLocalStorageOrNull() {
  if (localStorage.length === 0) {
    return null;
  }
  return localStorage.key(0);
}

async function loadVideosFromLocalStorage(key) {
  try {
    const cachedVideos = localStorage.getItem(key);
    if (cachedVideos) {
      videos = JSON.parse(cachedVideos);
      updateVideoList();
    } else {
      const fetchedVideos = await fetchPlaylistVideos(key);
      if (fetchedVideos) {
        videos = fetchedVideos;
        localStorage.setItem(key, JSON.stringify(videos));
        updateVideoList();
      }
    }
  } catch (error) {
    console.error("Error loading videos from local storage:", error);
    localStorage.removeItem(key);
  }
}

function setupPlayerWithFirstPossibleVideo() {
  const firstVideo = getNextPossibleVideo();
  if (firstVideo && firstVideo.videoId) {
    initializePlayer(firstVideo.videoId);
    showRatingOptions();
  }
}

function initializePlayer(videoId) {
  const iframe = document.createElement("iframe");
  iframe.id = "iframe-player";
  iframe.width = "560";
  iframe.height = "315";
  iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
  iframe.frameBorder = "0";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;

  const playerContainer = document.getElementById("playerContainer");
  playerContainer.innerHTML = ""; // Clear any existing content
  playerContainer.appendChild(iframe);

  player = new YT.Player("iframe-player", {
    events: {
      onReady: () => {
        debugger;
      },
      onStateChange: onPlayerStateChange,
      onError: onPlayerError,
    },
  });
}

function updateVideoList() {
  const videoList = document.getElementById("videoList");
  videoList.innerHTML = "";

  videos.forEach((video) => {
    const listItem = document.createElement("li");
    listItem.textContent = `Video ID: ${video.videoId}, Title: ${video.title}`;
    if (video.rating) {
      listItem.textContent += `, Rating: ${video.rating}`;
    }
    const playButton = document.createElement("button");
    playButton.className = "play-button";
    playButton.textContent = "Play";
    playButton.onclick = () => {
      const videoIndex = videos.findIndex((v) => v.videoId === video.videoId);
      currentVideoIndex = videoIndex;
      playNextVideo();
    };
    listItem.appendChild(playButton);
    videoList.appendChild(listItem);
  });
}

function playNextVideo() {
  const nextVideo = getNextPossibleVideo();

  if (!nextVideo) {
    alert("All videos have been rated.");
    return;
  }

  const videoId = nextVideo.videoId;
  document.getElementById("playerContainer").style.visibility = "visible";
  player.loadVideoById(videoId);

  document.getElementById("ratingOptions").style.display = "block";
  enterFullscreen();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    exitFullscreen();
    setTimeout(focusOnRatingOptions, 200);
  }
}

function onPlayerError(event) {
  if (document.getElementById("skipOnError").checked) {
    const currentVideo = videos[currentVideoIndex];
    currentVideo.rating = "unavailable";
    console.error(`Video ${currentVideo.videoId} is unavailable.`);
    updateVideoList();
    currentVideoIndex++;
    playNextVideo();
  }
}

function showRatingOptions() {
  // document.getElementById("playerContainer").style.visibility = "hidden";
  document.getElementById("ratingOptions").style.display = "block";
}

function rateVideo(rating) {
  const currentVideo = videos[currentVideoIndex];
  currentVideo.rating = rating;
  console.log(`Rated video ${currentVideo.videoId} with: ${rating}`);

  updateVideoList();

  currentVideoIndex++;
  document.getElementById("ratingOptions").style.display = "none";
  playNextVideo();
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch((err) => {
      console.error(`Error exiting fullscreen mode: ${err.message}`);
    });
  }
}

function downloadPlaylistAsJSON() {
  const jsonString = JSON.stringify(videos, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "playlist_ratings.json";
  document.body.appendChild(a);
  a.click();

  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadJSONFile(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        videos = JSON.parse(e.target.result);
        if (videos.length === 0) {
          alert("No videos found in the JSON file.");
          return;
        }
        localStorage.setItem("importedPlaylist", JSON.stringify(videos));
        updateVideoList();
      } catch (error) {
        alert("Invalid JSON file format.");
      }
    };
    reader.readAsText(file);
  }
}

function shufflePlaylist() {
  for (let i = videos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videos[i], videos[j]] = [videos[j], videos[i]];
  }

  playNextVideo();
}

function getNextPossibleVideo() {
  const skipRated = document.getElementById("skipRatedCheckbox").checked;
  const selectedRating = document.getElementById("ratingFilter").value;
  const includeGreaterEqual = document.getElementById(
    "ratingGreaterEqualCheckbox"
  ).checked;
  const ratingOrder = ["S", "A", "B", "C", "D", "F"]; // Order of ratings

  while (currentVideoIndex < videos.length) {
    const video = videos[currentVideoIndex];

    // If skipRated is enabled, skip videos that have already been rated
    if (skipRated && video.rating) {
      currentVideoIndex++;
      continue;
    }

    // Check if the video matches the selected rating filter
    if (selectedRating) {
      if (video.rating) {
        const videoRatingIndex = ratingOrder.indexOf(video.rating);
        const selectedRatingIndex = ratingOrder.indexOf(selectedRating);

        if (includeGreaterEqual) {
          if (videoRatingIndex <= selectedRatingIndex) {
            return videos[currentVideoIndex];
          }
        } else if (video.rating === selectedRating) {
          return videos[currentVideoIndex];
        }
      }
    } else {
      // No rating filter applied, return the current video
      return videos[currentVideoIndex];
    }

    currentVideoIndex++;
  }

  return null; // No more videos matching the criteria
}

window.addEventListener("beforeunload", (event) => {
  getFirstKeyFromLocalStorageOrNull().then((playlistIdOrNull) => {
    if (!playlistIdOrNull) {
      event.preventDefault();
      event.returnValue =
        "You have unsaved ratings. Make sure to download them before leaving.";
      return;
    }

    if (videos.length === 0) {
      localStorage.removeItem(playlistIdOrNull);
      return;
    } else {
      localStorage.setItem(playlistIdOrNull, JSON.stringify(videos));
    }
  });
});

// Keyboard controls for rating
document.addEventListener("keydown", (event) => {
  const key = event.key.toUpperCase();
  // ignore if modifier keys are pressed
  if (event.shiftKey && key === "F") {
    enterFullscreen();
  }

  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return;
  }
  const ratingKeys = ["S", "A", "B", "C", "D", "F"];

  if (ratingKeys.includes(key)) {
    rateVideo(key);
  } else if (key === "P") {
    // 'P' key to go to the previous video
    playPreviousVideo();
  } else if (key === "0") {
    enterFullscreen();
    replayVideo();
  }
});

function playPreviousVideo() {
  let tmpIndex = currentVideoIndex;
  while (tmpIndex > 0) {
    tmpIndex--; // Decrement index to go back
    const video = videos[tmpIndex];

    if (video.rating === "unavailable") {
      continue;
    }

    currentVideoIndex = tmpIndex;
    // Play the previous video that matches the criteria
    player.loadVideoById(video.videoId);
    document.getElementById("replayOptions").style.display = "none";
    return;
  }

  alert("No previous video available.");
}

function focusOnRatingOptions() {
  document.querySelector(".rating-options button").focus();
}

function enterFullscreen() {
  if (document.fullscreenEnabled) {
    //   player.getIframe().requestFullscreen();
    // 	}
    document
      .getElementById("iframe-player")
      .requestFullscreen()
      .catch((err) => {
        console.error(`Error entering fullscreen mode: ${err.message}`);
      });
  }
}

function replayVideo() {
  player.seekTo(0);
  player.playVideo();
}
