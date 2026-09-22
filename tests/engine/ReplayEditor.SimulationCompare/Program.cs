using ReplayEditor.SimulationCompare;

if (args.Length != 2)
{
    Console.Error.WriteLine("Usage: ReplayEditor.SimulationCompare <replay.osr> <beatmap.osu|beatmap-cache-dir>");
    Environment.ExitCode = 2;
    return;
}

Environment.ExitCode = ReplayComparisonTool.Run(args[0], args[1]);
