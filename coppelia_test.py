from coppeliasim_zmqremoteapi_client import RemoteAPIClient


def main() -> None:
    client = RemoteAPIClient()
    sim = client.require("sim")

    sim.setStepping(True)
    sim.startSimulation()

    try:
        for _ in range(100):
            print(
                f"Simulation time: "
                f"{sim.getSimulationTime():.3f} s"
            )
            sim.step()

    finally:
        sim.stopSimulation()


if __name__ == "__main__":
    main()