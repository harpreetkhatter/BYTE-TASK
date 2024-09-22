import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import axios from "axios";

import google from "googleapis";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 3000;


app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static('public'));
// Set up session management
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport Serialize/Deserialize
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// GitHub OAuth Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "https://byte-task-q1cp.onrender.com/auth/github/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, { profile, accessToken });
    }
  )
);

// GitHub API to check if user follows a specific account
const checkGitHubFollow = async (accessToken) => {
  try {
    const response = await axios.get(
      "https://api.github.com/user/following/bytemait",
      {
        headers: {
          Authorization: `token ${accessToken}`,
        },
      }
    );
    return response.status === 204;
  } catch (error) {
    return false; // If not following or any error
  }
};

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://byte-task-q1cp.onrender.com/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log("Access Token:", accessToken); // Debugging log
      try {
        // Check YouTube subscription
        const isSubscribed = await checkYouTubeSubscription(accessToken);
        if (isSubscribed) {
          return done(null, { profile, accessToken });
        } else {
          return done(null, false, {
            message: "Not subscribed to BYTE channel",
          });
        }
      } catch (error) {
        console.error("Error checking YouTube subscription:", error);
        return done(null, false, { message: "Failed to verify subscription" });
      }
    }
  )
);

async function checkYouTubeSubscription(accessToken) {
  try {
    const response = await axios.get(
      `https://youtube.googleapis.com/youtube/v3/subscriptions?part=snippet&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const BYTE_CHANNEL_ID = "UCgIzTPYitha6idOdrr7M8sQ";
    const subscriptions = response.data.items;

    for (const item of subscriptions) {
      if (item.snippet.resourceId.channelId === BYTE_CHANNEL_ID) {
        return true;
      }
    }
    return false; // If not subscribed, return false
  } catch (error) {
    console.error("Error fetching subscriptions:", error.message);
    return false; // Handle error gracefully by returning false
  }
}



// Route for the home page
app.get("/", (req, res) => {
  res.render("home")
 
});

// GitHub Authentication
app.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:follow"] })
);


app.get(
  "/auth/github/callback",
  passport.authenticate("github", { failureRedirect: "/auth/github/error" }),
  async (req, res) => {
    try {
      const { accessToken } = req.user;
      const isFollowing = await checkGitHubFollow(accessToken);
      if (isFollowing) {
        res.redirect("/private");
      } else {
        res.render("error", { message: "Please follow BYTE on GitHub to access this page." });
      }
    } catch (error) {
      console.error("Error during GitHub callback:", error);
      res.render("error", { message: "An error occurred during the GitHub authentication process." });
    }
  }
);

// Route to start Google authentication
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: [
     
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/youtube.readonly"
    ]
    
    
  })
);
app.get("/auth/google/callback", (req, res) => {
  passport.authenticate("google", async (err, user, info) => {
    if (err) {
      console.error("Error during authentication:", err);
      return res.render("error", { message: "Server error during Google callback." });
    }
    if (!user) {
      console.error("User authentication failed:", info.message);
      return res.render("error", { message: info.message });
    }
    
    // Check for YouTube subscription
    const isSubscribed = await checkYouTubeSubscription(user.accessToken);
    if (!isSubscribed) {
      return res.render("error", { message: "You must be subscribed to the BYTE channel." });
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        console.error("Login error:", loginErr);
        return res.render("error", { message: "Login failed." });
      }
      return res.redirect("/private");
    });
  })(req, res);
});

// Private Route
// Private Route
app.get("/private", (req, res) => {
 res.render("private");
});

// Listen on port 3000
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
