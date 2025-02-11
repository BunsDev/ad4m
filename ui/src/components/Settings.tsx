import { Agent, Literal } from "@perspect3vism/ad4m";
import { useContext, useEffect, useState } from "react";
import {
  PREDICATE_FIRSTNAME,
  PREDICATE_LASTNAME,
  PREDICATE_USERNAME,
} from "../constants/triples";
import { cardStyle } from "./styles";
import { Ad4minContext } from "../context/Ad4minContext";
import { buildAd4mClient, copyTextToClipboard } from "../util";
import { useCallback } from "react";
import { invoke } from "@tauri-apps/api";
import QRCode from "react-qr-code";
import { AgentContext } from "../context/AgentContext";
import ActionButton from "./ActionButton";
import { appWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/api/shell";

type Props = {
  did: String;
  opened: boolean;
  setOpened: (val: boolean) => void;
};

export const fetchProfile = async (agent: Agent) => {
  const tempProfile = {
    firstName: "",
    lastName: "",
    username: "",
  };

  for (const {
    data: { source, predicate, target },
  } of agent.perspective?.links!) {
    if (source === agent.did) {
      if (predicate === PREDICATE_FIRSTNAME) {
        tempProfile.firstName = Literal.fromUrl(target).get();
      } else if (predicate === PREDICATE_LASTNAME) {
        tempProfile.lastName = Literal.fromUrl(target).get();
      } else if (predicate === PREDICATE_USERNAME) {
        tempProfile.username = Literal.fromUrl(target).get();
      }
    }
  }

  return tempProfile;
};

const Profile = (props: Props) => {
  const {
    state: { loading },
    methods: { lockAgent },
  } = useContext(AgentContext);

  const {
    state: { url, did, client, expertMode, isInitialized },
    methods: { toggleExpertMode },
  } = useContext(Ad4minContext);

  const [trustedAgents, setTrustedAgents] = useState<any[]>([]);

  const [trustedAgentModalOpen, settrustedAgentModalOpen] = useState(false);

  const [clearAgentModalOpen, setClearAgentModalOpen] = useState(false);

  const [proxy, setProxy] = useState("");

  const [qrcodeModal, setQRCodeModal] = useState(false);

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [loadingProxy, setLoadingProxy] = useState(false);

  function openLogs() {
    appWindow.emit("copyLogs");
  }

  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    username: "",
  });

  const onPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    let { value } = event.target;
    setPassword(value);
  };

  const getTrustedAgents = useCallback(async () => {
    if (url) {
      const client = await buildAd4mClient(url);
      const trustedAgents = await client!.runtime.getTrustedAgents();

      const tempTempAgents = [];

      for (const agent of trustedAgents) {
        const fetchedAgent = await client!.agent.byDID(agent);

        if (fetchedAgent) {
          const profile = await fetchProfile(fetchedAgent);

          tempTempAgents.push({ did: agent, ...profile });
        } else {
          tempTempAgents.push({ did: agent });
        }
      }

      setTrustedAgents(tempTempAgents);
    }
  }, [url]);

  const fetchCurrentAgentProfile = useCallback(async () => {
    if (url) {
      const client = await buildAd4mClient(url);
      const agent = await client!.agent.me();

      const profile = await fetchProfile(agent);

      setProfile(profile);
    }
  }, [url]);

  useEffect(() => {
    fetchCurrentAgentProfile();
    getTrustedAgents();
  }, [fetchCurrentAgentProfile, getTrustedAgents]);

  useEffect(() => {
    const getProxy = async () => {
      const proxy: string = await invoke("get_proxy");
      console.log(proxy);
      setProxy(formatProxy(proxy));
    };
    getProxy().catch(console.error);
  }, []);

  // @ts-ignore
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (isInitialized) {
        clearAgent(password);
      }
    }
  };

  const formatProxy = (proxy: string) => {
    return (
      proxy.replace(/^https(.*)/, "wss$1").replace(/^http(.*)/, "ws$1") +
      "/graphql"
    );
  };

  const copyText = (text: string) => {
    copyTextToClipboard(text);
  };

  const showProxyQRCode = () => {
    setQRCodeModal(true);
  };

  const clearAgent = async (password: string) => {
    console.log("clearAgent 0", password);
    let agentStatus = await client?.agent.lock(password);
    console.log("clearAgent 1", agentStatus);
    if (!agentStatus?.isUnlocked) {
      await invoke("clear_state");
    }
  };

  const setupProxy = async (event: any) => {
    try {
      setLoadingProxy(true);
      const proxy: string = await invoke("setup_proxy", { subdomain: did });
      console.log("Finish setup proxy, ", proxy);
      setProxy(formatProxy(proxy));
      event.target.checked = true;
    } catch (e) {
      event.target.checked = false;
      setProxy("");
    } finally {
      setLoadingProxy(false);
    }
  };

  const stopProxy = async (event: any) => {
    try {
      await invoke("stop_proxy");
      setProxy("");
      event.target.checked = false;
    } catch (e) {
      event.target.checked = true;
    }
  };

  return (
    <div>
      <j-box px="500" my="500">
        <j-toggle
          full=""
          checked={expertMode}
          onChange={(e) => toggleExpertMode()}
        >
          Advanced mode
        </j-toggle>
      </j-box>

      <j-box px="500" my="500">
        <j-toggle
          checked={!!proxy}
          onChange={(e) => {
            e.target.checked ? setupProxy(e) : stopProxy(e);
          }}
        >
          Proxy
        </j-toggle>

        {loadingProxy && <j-spinner size="sm"></j-spinner>}

        {proxy && (
          <j-box pb="500">
            <j-flex a="center">
              <ActionButton
                title="Proxy URL"
                onClick={() => copyText(proxy)}
                icon="clipboard"
              />
              <ActionButton
                title="QR Code"
                onClick={showProxyQRCode}
                icon="qr-code-scan"
              />
              <ActionButton
                title="Open GraphQL"
                onClick={() => open(url.replace("ws", "http"))}
                icon="box-arrow-up-right"
              />
            </j-flex>
          </j-box>
        )}
      </j-box>

      <j-box px="500" my="500">
        <j-button
          onClick={() => settrustedAgentModalOpen(true)}
          full
          variant="secondary"
        >
          <j-icon size="sm" slot="start" name="shield-check"></j-icon>
          Show trusted agents
        </j-button>
      </j-box>

      <j-box px="500" my="500">
        <j-button onClick={openLogs} full variant="secondary">
          <j-icon size="sm" slot="start" name="clipboard"></j-icon>
          Show logs
        </j-button>
      </j-box>

      <j-box px="500" my="500">
        <j-button
          onClick={() => setClearAgentModalOpen(true)}
          full
          variant="primary"
        >
          <j-icon size="sm" slot="start" name="trash"></j-icon>
          Delete Agent
        </j-button>
      </j-box>

      {trustedAgentModalOpen && (
        <j-modal
          size="fullscreen"
          open={trustedAgentModalOpen}
          onToggle={(e: any) => settrustedAgentModalOpen(e.target.open)}
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Trusted Agents
              </j-text>
            </j-box>
            {trustedAgents.map((e, i) => (
              <div
                key={`trusted-agent-${e.did}`}
                style={{ ...cardStyle, width: "100%" }}
              >
                <j-flex direction="column" style={{ marginTop: 4 }}>
                  <j-text weight="bold">{e?.username || "No username"}</j-text>
                  <j-flex a="center" j="between">
                    <j-text nomargin variant="body" size="xs">
                      {e?.did.length > 25
                        ? `${e?.did.substring(0, 25)}...`
                        : e?.did}
                    </j-text>
                    <j-box p="100"></j-box>
                    <j-button
                      size="xs"
                      variant="transparent"
                      onClick={() => copyText(e?.did)}
                    >
                      <j-icon size="xs" slot="end" name="clipboard"></j-icon>
                    </j-button>
                  </j-flex>
                </j-flex>
              </div>
            ))}
          </j-box>
        </j-modal>
      )}
      {qrcodeModal && (
        <j-modal
          size="fullscreen"
          open={qrcodeModal}
          onToggle={(e: any) => setQRCodeModal(e.target.open)}
          title="Proxy QR Code"
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Scan this QR on your phone
              </j-text>
            </j-box>
            <j-box bg="ui-900" px="900" py="600">
              <QRCode value={proxy} />
            </j-box>
          </j-box>
        </j-modal>
      )}

      {clearAgentModalOpen && (
        <j-modal
          size="fullscreen"
          open={clearAgentModalOpen}
          onToggle={(e: any) => setClearAgentModalOpen(e.target.open)}
        >
          <j-box px="400" py="600">
            <j-box pb="500">
              <j-text nomargin size="600" color="black" weight="600">
                Clear agent
              </j-text>
            </j-box>
            <j-text>
              Warning: by clearing the agent you will loose all the data and
              will have to start with a fresh agent
            </j-text>
            <j-box p="200"></j-box>
            <j-input
              placeholder="Password"
              label="Input your passphrase to clear agent"
              type={showPassword ? "text" : "password"}
              size="lg"
              required
              onInput={onPasswordChange}
              onKeyDown={onKeyDown}
              autovalidate
            >
              <j-button
                onClick={() => setShowPassword(!showPassword)}
                slot="end"
                variant="link"
                square
              >
                <j-icon
                  name={showPassword ? "eye-slash" : "eye"}
                  size="sm"
                ></j-icon>
              </j-button>
            </j-input>
            <j-box p="200"></j-box>
            <j-flex>
              <j-button
                variant="primary"
                onClick={() => clearAgent(password)}
                loading={loading}
              >
                Delete Agent
              </j-button>
            </j-flex>
          </j-box>
        </j-modal>
      )}
    </div>
  );
};

export default Profile;
