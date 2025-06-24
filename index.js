const express = require("express");
const cors = require("cors");
const { v4: uuidv4, validate: isUUID } = require("uuid");
const platformClient = require("purecloud-platform-client-v2");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Health Check
app.get("/", (req, res) => {
  res.json({ message: "Node backend is running!" });
});

// POST /api/copy-roles
app.post("/api/copy-roles", async (req, res) => {
  const { sourceUserID, targetUserID, credentials } = req.body;

  if (!isUUID(sourceUserID) || !isUUID(targetUserID)) {
    return res.status(400).json({ error: "Invalid UUID format" });
  }

  if (
    !credentials ||
    !credentials.clientId ||
    !credentials.clientSecret ||
    !credentials.region
  ) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  // Configure Genesys client for this request
  const client = platformClient.ApiClient.instance;
  client.setEnvironment(platformClient.PureCloudRegionHosts[credentials.region]);

  const usersApi = new platformClient.UsersApi();

  // Authenticate using provided credentials
  async function authenticate() {
    return client
      .loginClientCredentialsGrant(credentials.clientId, credentials.clientSecret)
      .then(() => {
        console.log("Authenticated successfully.");
      })
      .catch((err) => {
        console.error("OAuth failed:", err);
        throw new Error("Authentication failed");
      });
  }

  try {
    await authenticate();

    // 1. Get source user's roles
    const sourceData = await usersApi.getAuthorizationSubject(sourceUserID, { includeDuplicates: false });

    const grants = (sourceData.grants || []).map((grant) => ({
      roleId: grant.role.id,
      divisionId: grant.division.id,
    }));

    if (grants.length === 0) {
      return res.json({ message: "No roles found for source user" });
    }

    // 2. Replace target user's roles
    await usersApi.postAuthorizationSubjectBulkreplace(targetUserID, { grants }, { subjectType: "PC_USER" });

    return res.status(200).json({
      message: "Roles copied successfully",
      assigned_roles: grants,
    });

  } catch (err) {
    console.error("Error in /api/copy-roles:", err);
    return res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});