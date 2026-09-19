const psEnv = require("@ps/env/tps");
const axios = require("axios");
const { MetaIntegration, 
    MetaPage, 
    MetaLeadForm,
    MetaLeadFormMapping,
    ExternalLeadType, 
} = require("../../models");

const META_BASE = "https://graph.facebook.com/v22.0";

/**
 * Redirect admin to Meta OAuth
 */
exports.connect = async (req, res) => {
  const { returnPath } = req.query;

  const scopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "leads_retrieval",
    "pages_manage_ads",
  ];

  const authUrl =
    `https://www.facebook.com/v22.0/dialog/oauth?` +
    `client_id=${psEnv.META_APP_ID}` +
    `&redirect_uri=${psEnv.META_REDIRECT_URI}` +
    `&scope=${scopes.join(",")}` +
    `&response_type=code` +
    `&state=${encodeURIComponent(returnPath)}`;

  return res.json({ url: authUrl });
};

/**
 * OAuth callback
 */
exports.callback = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({
      message: "Authorization code missing",
    });
  }

  try {
    /**
     * Exchange code → short token
     */
    const tokenResponse = await axios.get(`${META_BASE}/oauth/access_token`, {
      params: {
        client_id: psEnv.META_APP_ID,
        client_secret: psEnv.META_APP_SECRET,
        redirect_uri: psEnv.META_REDIRECT_URI,
        code,
      },
    });

    const shortToken = tokenResponse.data.access_token;

    /**
     * Convert to long lived token
     */
    const longTokenRes = await axios.get(`${META_BASE}/oauth/access_token`, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: psEnv.META_APP_ID,
        client_secret: psEnv.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });

    const accessToken = longTokenRes.data.access_token;

    /**
     * Get Meta user info
     */
    const profileRes = await axios.get(`${META_BASE}/me`, {
      params: {
        access_token: accessToken,
      },
    });

    const profile = profileRes.data;

    /**
     * Prevent duplicate integrations
     */
    let integration = await MetaIntegration.findOne({
      where: {
        account_id: profile.id,
      },
    });

    if (integration) {
      await integration.update({
        access_token: accessToken,
        account_name: profile.name,
      });
    } else {
      integration = await MetaIntegration.create({
        account_id: profile.id,
        account_name: profile.name,
        access_token: accessToken,
        metadata: profile,
      });
    }

    const redirectPath = state || psEnv.ADMIN_FRONTEND_URL;

    return res.redirect(
      `${psEnv.ADMIN_FRONTEND_URL}${redirectPath}?connected=${integration.id}`,
    );
  } catch (error) {
    console.error("Meta OAuth Error:", error.response?.data || error);

    return res.status(500).json({
      message: "Meta connection failed",
    });
  }
};

/**
 * List meta integrations
 */
exports.listMetaIntegrations = async (req, res) => {
  try {
    const integrations = await MetaIntegration.findAll({
      attributes: ["id", "account_name", "createdAt"],
    });

    return res.json(integrations);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch integrations",
    });
  }
};

/**
 * Delete integration
 */
exports.deleteIntegration = async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await MetaIntegration.findByPk(id);

    if (!integration) {
      return res.status(404).json({
        message: "Integration not found",
      });
    }

    await integration.destroy();

    return res.json({
      message: "Integration deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete integration",
    });
  }
};

/* ---------------- META PAGES -----------------*/

exports.syncPages = async (req, res) => {
  const { id } = req.params;

  try {
    const integration = await MetaIntegration.findByPk(id);

    if (!integration) {
      return res.status(404).json({
        message: "Integration not found",
      });
    }

    const pagesRes = await axios.get(`${META_BASE}/me/accounts`, {
      params: {
        access_token: integration.access_token,
      },
    });

    const pages = pagesRes.data.data || [];

    const syncedPages = [];
    const failedPages = [];

    for (const page of pages) {
      try {
        if (!page.access_token) {
          failedPages.push({
            page_id: page.id,
            page_name: page.name,
            reason: "Page access token missing",
          });
          continue;
        }

        const existingPage = await MetaPage.findOne({
          where: { page_id: page.id },
        });

        if (existingPage) {
          if (existingPage.integration_id !== integration.id) {
            failedPages.push({
              page_id: page.id,
              page_name: page.name,
              reason: "Page already connected by another integration",
            });

            continue;
          }

          // update existing page
          await existingPage.update({
            page_name: page.name,
            page_access_token: page.access_token,
            metadata: page,
          });

          syncedPages.push({
            page_id: page.id,
            page_name: page.name,
          });

          continue;
        }

        await MetaPage.create({
          integration_id: integration.id,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          metadata: page,
        });

        syncedPages.push({
          page_id: page.id,
          page_name: page.name,
        });
      } catch (error) {
        failedPages.push({
          page_id: page.id,
          page_name: page.name,
          reason: error.message || "Unknown error",
        });
      }
    }

    return res.json({
      message: "Pages sync completed",
      total: pages.length,
      synced: syncedPages.length,
      failed: failedPages.length,
      syncedPages,
      failedPages,
    });
  } catch (error) {
    console.error(error.response?.data || error);

    return res.status(500).json({
      message: "Failed to sync pages",
    });
  }
};

exports.getPages = async (req, res) => {
  const { id } = req.params;

  try {
    const integration = await MetaIntegration.findByPk(id);

    if (!integration) {
      return res.status(404).json({
        message: "Integration not found",
      });
    }

    const pages = await MetaPage.findAll({
      where: {
        integration_id: id,
      },
      attributes: ["id", "page_id", "page_name", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      pages,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch pages",
    });
  }
};

exports.getPage = async (req, res) => {
  const { pageId } = req.params;

  try {
    const page = await MetaPage.findByPk(pageId, {
      attributes: ["id", "page_id", "page_name", "createdAt"],
    });

    if (!page) {
      return res.status(404).json({
        message: "Page not found",
      });
    }

    return res.json({
      page,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch page",
    });
  }
};

/* ---------------- META LEAD FORMS -----------------*/

exports.syncForms = async (req, res) => {
  const { pageId } = req.params;

  try {
    const page = await MetaPage.findByPk(pageId);

    if (!page) {
      return res.status(404).json({
        message: "Page not found",
      });
    }

    const formsRes = await axios.get(
      `${META_BASE}/${page.page_id}/leadgen_forms`,
      {
        params: {
          access_token: page.page_access_token,
        },
      },
    );

    const forms = formsRes.data.data || [];    

    const syncedForms = [];
    const failedForms = [];

    for (const form of forms) {
      try {
        const existingForm = await MetaLeadForm.findOne({
          where: { form_id: form.id },
        });

        if (existingForm) {
          if (existingForm.page_id !== page.id) {
            failedForms.push({
              form_id: form.id,
              form_name: form.name,
              reason: "Form already synced from another page",
            });

            continue;
          }

          // update existing form
          await existingForm.update({
            form_name: form.name,
            status: form.status,
            metadata: form,
          });

          syncedForms.push({
            form_id: form.id,
            form_name: form.name,
          });

          continue;
        }

        await MetaLeadForm.create({
          page_id: page.id,
          form_id: form.id,
          form_name: form.name,
          status: form.status,
          metadata: form,
        });

        syncedForms.push({
          form_id: form.id,
          form_name: form.name,
        });
      } catch (error) {
        failedForms.push({
          form_id: form.id,
          form_name: form.name,
          reason: error.message || "Unknown error",
        });
      }
    }

    return res.json({
      message: "Forms sync completed",
      total: forms.length,
      synced: syncedForms.length,
      failed: failedForms.length,
      syncedForms,
      failedForms,
    });
  } catch (error) {
    console.error(error.response?.data || error);

    return res.status(500).json({
      message: "Failed to sync forms",
    });
  }
};

exports.getForms = async (req, res) => {
  const { pageId } = req.params;

  try {
    const forms = await MetaLeadForm.findAll({
      where: {
        page_id: pageId,
      },
      attributes: ["id", "form_id", "form_name", "status", "createdAt"],
      include: [
        {
          model: MetaLeadFormMapping,
          as: "leadTypeMappings",
          attributes: ['id'],
          include: [
            {
              model: ExternalLeadType,
              as: "leadType",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formattedForms = forms.map((form) => {
      const data = form.toJSON();

      return {
        ...data,
        leadTypes: data.leadTypeMappings.map((m) => m.leadType),
      };
    });

    return res.json({
      forms: formattedForms,
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch forms",
    });
  }
};
