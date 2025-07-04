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

// POST /api/users - fetch all users from Genesys Cloud (with pagination)
app.post("/api/users", async (req, res) => {
  const { credentials } = req.body;

  if (!credentials || !credentials.clientId || !credentials.clientSecret || !credentials.region) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const client = platformClient.ApiClient.instance;
  client.setEnvironment(platformClient.PureCloudRegionHosts[credentials.region]);
  const usersApi = new platformClient.UsersApi();

  async function authenticate() {
    return client
      .loginClientCredentialsGrant(credentials.clientId, credentials.clientSecret)
      .then(() => {
        console.log("Authenticated successfully for /api/users.");
      })
      .catch((err) => {
        console.error("OAuth failed:", err);
        throw new Error("Authentication failed");
      });
  }

  try {
    await authenticate();
    let allUsers = [];
    let pageNumber = 1;
    const pageSize = 100;
    let totalPages = 1;
    do {
      const opts = {
        pageSize,
        pageNumber,
        state: "active"
      };
      const data = await usersApi.getUsers(opts);
      if (data && data.entities) {
        allUsers = allUsers.concat(data.entities);
      }
      if (data.pageCount) {
        totalPages = data.pageCount;
      } else if (data.pageCount === undefined && data.pageSize && data.total) {
        totalPages = Math.ceil(data.total / data.pageSize);
      }
      pageNumber++;
    } while (pageNumber <= totalPages);

    // Return only relevant user info (id, name, email, etc.)
    const users = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      state: u.state
    }));
    return res.status(200).json({ users });
  } catch (err) {
    console.error("Error in /api/users:", err);
    return res.status(500).json({ error: "Internal Server Error", detail: err.message });
  }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const isRender = !!process.env.RENDER; // Render sets this automatically
  if (isRender) {
    console.log(`Server running on Render Cloud (port ${PORT})`);
  } else {
    console.log(`Server running locally at http://localhost:${PORT}`);
  }
});
