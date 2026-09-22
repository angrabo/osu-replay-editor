using ReplayEditor.Core;
using ReplayEditor.Simulation;
using Xunit;

namespace ReplayEditor.SimulationSmoke;

public sealed class SimulationEngineTests
{
    [Fact]
    public void BasicJudgementsAndSelectedArea()
    {
        const string map = """
        osu file format v14

        [Difficulty]
        CircleSize:4
        OverallDifficulty:5
        SliderMultiplier:1.4

        [TimingPoints]
        0,500,4,2,1,50,1,0

        [HitObjects]
        100,100,1000,1,0,0:0:0:0:
        200,100,2000,1,0,0:0:0:0:
        300,100,3000,1,0,0:0:0:0:
        400,100,4000,1,0,0:0:0:0:
        """;

        var frames = new[]
        {
            new SimulationFrame(900, 100, 100, 0), new SimulationFrame(1000, 100, 100, 1), new SimulationFrame(1010, 100, 100, 0),
            new SimulationFrame(1900, 200, 100, 0), new SimulationFrame(2060, 200, 100, 2), new SimulationFrame(2070, 200, 100, 0),
            new SimulationFrame(2900, 300, 100, 0), new SimulationFrame(3125, 300, 100, 5), new SimulationFrame(3135, 300, 100, 0),
            new SimulationFrame(4500, 400, 100, 0),
        };

        var result = SimulationEngine.SimulateWhole(map, frames, 0);
        Assert.True(result.Client == "stable", "expected stable simulation for legacy replay");

        var lazerResult = SimulationEngine.SimulateWhole(map, frames, 0, 30000001);
        Assert.True(lazerResult.Client == "lazer" && lazerResult.Model == "editor-lazer-v1" && lazerResult.Judgements.Length == 4,
            "expected dedicated lazer simulation");
        Assert.True(lazerResult.Score is >= 0 and <= 1_000_000, "expected normalized lazer score");

        Assert.True(result.Count300 == 1, "expected one 300");
        Assert.True(result.Count100 == 1, "expected one 100");
        Assert.True(result.Count50 == 1, "expected one 50");
        Assert.True(result.Misses == 1, "expected one miss");
        Assert.True(Math.Abs(result.Accuracy - 37.5) < .001, "expected 37.5% accuracy");
        Assert.True(result.MaxCombo == 3 && result.AchievedCombo == 0, "expected max combo 3 and broken ending combo");
        Assert.True(result.Judgements.Select(item => item.Result).SequenceEqual(new[] { "300", "100", "50", "miss" }), "unexpected judgement order");
        Assert.True(result.Judgements[2].Key == "K1" && result.Judgements[2].HitError == 125, "expected K1 and +125 ms hit error");
        Assert.True(result.Perfect == false && lazerResult.CountGeki is null && lazerResult.CountKatu is null,
            "perfect follows combo completion and unavailable lazer combo-end counts stay unset");

        var selectedArea = SimulationEngine.SimulateRange(map, frames, 0, 20260620, 1900, 3500);
        Assert.True(selectedArea.Scope == "selected-area" && selectedArea.TotalObjects == 2 && selectedArea.Count100 == 1 && selectedArea.Count50 == 1,
            "selected area object counts");
        Assert.True(selectedArea.Score == result.Judgements[2].ScoreAfter - result.Judgements[0].ScoreAfter && selectedArea.AchievedCombo == 3,
            "selected area score gain and carried combo");
    }

    [Fact]
    public void ComboEndCounts()
    {
        const string comboEndMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:5\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n200,100,2000,5,0,0:0:0:0:\n";
        var comboEndResult = SimulationEngine.SimulateWhole(comboEndMap,
            [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0), new(1900, 200, 100, 0), new(2060, 200, 100, 1), new(2100, 200, 100, 0)], 0);
        Assert.True(comboEndResult.CountGeki == 1 && comboEndResult.CountKatu == 1 && comboEndResult.Perfect == true,
            "stable combo-end Geki and Katu follow new-combo boundaries while Perfect follows full combo");
    }

    [Fact]
    public void HitWindowBoundaries()
    {
        foreach (var (time, expected) in new (long Time, string Expected)[] { (1049, "300"), (1050, "100"), (1099, "100"), (1100, "50"), (1149, "50"), (1150, "miss") })
        {
            var boundary = SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap, [new(900, 100, 100, 0), new(time, 100, 100, 1), new(1200, 100, 100, 0)], 0);
            Assert.True(boundary.Judgements[0].Result == expected, $"stable hit window boundary {time}");
        }

        Assert.True(SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap, [new(900, 100, 100, 0), new(1060, 100, 100, 1), new(1200, 100, 100, 0)], 2).Count300 == 1,
            "EZ expands OD hit window");

        foreach (var (time, expected) in new (long Time, string Expected)[]
                 { (1050, "300"), (1100, "100"), (1150, "50"), (1151, "miss"), (950, "100"), (900, "50"), (850, "miss") })
        {
            var boundary = SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap,
                [new(800, 100, 100, 0), new(time, 100, 100, 1), new(1200, 100, 100, 0)], 0, 30_000_001,
                scoreMultiplier: 1, lazerInclusiveLateHitWindows: true);
            Assert.True(boundary.Judgements[0].Result == expected, $"lazer inclusive hit window boundary {time}");
        }

        var strictLazer = SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap,
            [new(900, 100, 100, 0), new(1050, 100, 100, 1), new(1200, 100, 100, 0)], 0, 30_000_001);
        Assert.True(strictLazer.Count100 == 1, "lazer defaults to strict integer replay boundaries without source evidence");
    }

    [Fact]
    public void EarlyMissBoundaries()
    {
        const string earlyMissMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:8\n[HitObjects]\n200,236,1000,1,0,0:0:0:0:\n";
        var earlyMiss = SimulationEngine.SimulateWhole(earlyMissMap,
            [new(870, 173, 249, 0), new(879, 173, 249, 8), new(900, 173, 249, 0), new(1015, 214, 237, 4)], 1 << 29);
        Assert.True(earlyMiss.Count300 == 0 && earlyMiss.Misses == 1 && earlyMiss.Judgements[0].HitTime == 879,
            "stable consumes a near-edge early press as a miss before a later in-window press");

        const string od9EarlyMissMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:9\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n";
        var od9EarlyMiss = SimulationEngine.SimulateWhole(od9EarlyMissMap,
            [new(870, 100, 100, 0), new(882, 100, 100, 1), new(900, 100, 100, 0), new(1010, 100, 100, 1)], 1 << 29);
        Assert.True(od9EarlyMiss.Misses == 1 && od9EarlyMiss.Judgements[0].HitTime == 882,
            "OD9 early press eight milliseconds outside the 50 window must consume the object as a miss");
    }

    [Fact]
    public void ShortSliderTailBeforeMissedHeadTimesOut()
    {
        const string shortMissedHeadMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:9\nSliderMultiplier:1\nSliderTickRate:1\n"
            + "[TimingPoints]\n0,100,4,2,1,50,1,0\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n200,100,1100,2,0,L|300:100,1,100\n300,100,1300,1,0,0:0:0:0:\n";
        var shortMissedHead = SimulationEngine.SimulateWhole(shortMissedHeadMap,
        [
            new(990, 100, 100, 0), new(1000, 100, 100, 1), new(1020, 100, 100, 0),
            new(1100, 200, 100, 0), new(1130, 250, 100, 1), new(1160, 260, 100, 1),
            new(1180, 280, 100, 0), new(1300, 300, 100, 1), new(1320, 300, 100, 0)
        ], 1 << 29);
        Assert.True(shortMissedHead.Judgements[1].Result == "50" && shortMissedHead.MaxCombo == 2,
            "a short slider tail can raise combo before its missed head times out");

        var recordedV2 = SimulationEngine.ReconcileRecordedStableScore(shortMissedHead, shortMissedHead.Score - 120,
            shortMissedHead.MaxCombo, [shortMissedHead.Count300, shortMissedHead.Count100, shortMissedHead.Count50, 0, 0, shortMissedHead.Misses],
            true, 1 << 29, 1 << 29);
        Assert.True(recordedV2.Score == shortMissedHead.Score - 120 && recordedV2.Status == "source-calibrated"
            && recordedV2.BonusScore == shortMissedHead.BonusScore,
            "matching unedited ScoreV2 results can use the recorded final score without inventing spinner bonus");
    }

    [Fact]
    public void LazerMissedSliderTailDoesNotResetCombo()
    {
        const string map = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:5\nSliderMultiplier:1\nSliderTickRate:1\n"
            + "[TimingPoints]\n0,100,4,2,1,50,1,0\n[HitObjects]\n100,100,1000,2,0,L|200:100,1,100\n400,300,1200,1,0,0:0:0:0:\n";
        var result = SimulationEngine.SimulateWhole(map,
        [
            new(990, 100, 100, 0), new(1000, 100, 100, 1), new(1050, 150, 100, 1),
            new(1060, 400, 300, 1), new(1100, 400, 300, 1), new(1110, 400, 300, 0),
            new(1200, 400, 300, 1), new(1210, 400, 300, 0)
        ], 0, 30_000_001);

        Assert.True(result.SliderEndsHit == 0 && result.SliderEndsTotal == 1,
            "fixture must miss only the slider tail");
        Assert.True(result.MaxCombo == 2 && result.AchievedCombo == 2,
            "lazer ignore_miss slider tail removes one combo increment without resetting combo");
    }

    [Fact]
    public void FractionalOdWindowTruncation()
    {
        const string fractionalOdMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:9.4\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n";
        Assert.True(SimulationEngine.SimulateWhole(fractionalOdMap, [new(900, 100, 100, 0), new(1022, 100, 100, 1), new(1100, 100, 100, 0)], 0).Count300 == 1,
            "stable fractional OD keeps errors below the truncated window as 300");
        Assert.True(SimulationEngine.SimulateWhole(fractionalOdMap, [new(900, 100, 100, 0), new(1023, 100, 100, 1), new(1100, 100, 100, 0)], 0).Count100 == 1,
            "stable fractional OD truncates the 300 window instead of rounding it up");
    }

    [Fact]
    public void ChronologicalPressAssignment()
    {
        const string chronologicalPressMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:9.4\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n200,100,1050,1,0,0:0:0:0:\n";
        var chronologicalPressResult = SimulationEngine.SimulateWhole(chronologicalPressMap,
        [
            new(900, 100, 100, 0), new(919, 100, 100, 1), new(920, 100, 100, 0),
            new(1000, 100, 100, 1), new(1001, 100, 100, 0), new(1050, 200, 100, 1), new(1051, 200, 100, 0)
        ], 0);
        Assert.True(chronologicalPressResult.Count50 == 1 && chronologicalPressResult.Count300 == 1,
            "stable must consume the first chronological valid press instead of replacing an existing 50 with a later 300");
    }

    [Fact]
    public void StableStacking()
    {
        var stackedObjects = Enumerable.Range(0, 16).Select(index => $"100,100,{1000 + index * 20},1,0,0:0:0:0:");
        var stackedMap = "osu file format v14\n[General]\nStackLeniency:0.7\n[Difficulty]\nCircleSize:5\nOverallDifficulty:5\nApproachRate:10\n[HitObjects]\n"
            + string.Join('\n', stackedObjects);

        var stackedFrames = new List<SimulationFrame>();
        for (var index = 0; index < 16; index++)
        {
            var time = 1000 + index * 20;
            var offset = -(15 - index) * 3.2;
            stackedFrames.Add(new SimulationFrame(time - 1, 100 + offset, 100 + offset, 0));
            stackedFrames.Add(new SimulationFrame(time, 100 + offset, 100 + offset, 1));
            stackedFrames.Add(new SimulationFrame(time + 1, 100 + offset, 100 + offset, 0));
        }

        var stackedResult = SimulationEngine.SimulateWhole(stackedMap, stackedFrames, 0);
        Assert.True(stackedResult.Count300 == 16 && stackedResult.MaxCombo == 16, "stable stack offsets must be used for replay hit-testing");

        var hardRockStackedFrames = new List<SimulationFrame>();
        for (var index = 0; index < 16; index++)
        {
            var time = 1000 + index * 20;
            var offset = -(15 - index) * 2.528;
            hardRockStackedFrames.Add(new SimulationFrame(time - 1, 100 + offset, 384 - (100 + offset), 0));
            hardRockStackedFrames.Add(new SimulationFrame(time, 100 + offset, 384 - (100 + offset), 1));
            hardRockStackedFrames.Add(new SimulationFrame(time + 1, 100 + offset, 384 - (100 + offset), 0));
        }

        var hardRockStackedResult = SimulationEngine.SimulateWhole(stackedMap, hardRockStackedFrames, 16, scoreMultiplier: 1.06);
        Assert.True(hardRockStackedResult.Count300 == 16 && hardRockStackedResult.MaxCombo == 16, "HR must flip already-stacked stable positions");
    }

    [Fact]
    public void HardRockFlipsPlayfieldPosition()
    {
        Assert.True(SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap, [new(900, 100, 284, 0), new(1000, 100, 284, 1), new(1100, 100, 284, 0)], 16).Count300 == 1,
            "HR flips playfield position");
    }

    [Fact]
    public void Notelock()
    {
        const string notelockMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:5\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n200,100,1100,1,0,0:0:0:0:\n";
        var notelockResult = SimulationEngine.SimulateWhole(notelockMap, [new(900, 200, 100, 0), new(1050, 200, 100, 1), new(1060, 200, 100, 0)], 0);
        Assert.True(notelockResult.Misses == 2, "stable notelock must reject a later object's press while the previous miss is unresolved");
    }

    [Fact]
    public void ReplayTimestampsStayInGameplayClock()
    {
        Assert.True(SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap, [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0)], 64).Count300 == 1,
            "DT replay timestamps stay in gameplay-clock milliseconds");
        Assert.True(SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap, [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0)], 256).Count300 == 1,
            "HT replay timestamps stay in gameplay-clock milliseconds");
    }

    [Fact]
    public void StableScoreV2Normalization()
    {
        var scoreV2Perfect = SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap,
            [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0)], TestFixtures.ScoreV2Mod);
        Assert.True(scoreV2Perfect.Model == "editor-stable-v2" && scoreV2Perfect.Score == 1_000_000, "stable ScoreV2 mod selects normalized scoring");

        var scoreV2Imperfect = SimulationEngine.SimulateWhole(TestFixtures.BoundaryMap,
            [new(900, 100, 100, 0), new(1060, 100, 100, 1), new(1100, 100, 100, 0)], TestFixtures.ScoreV2Mod);
        Assert.True(scoreV2Imperfect.Count100 == 1 && scoreV2Imperfect.Score < scoreV2Perfect.Score, "stable ScoreV2 accuracy affects score");

        const string twoCircleMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:5\n[HitObjects]\n100,100,1000,1,0,0:0:0:0:\n200,100,2000,1,0,0:0:0:0:\n";
        var scoreV2FullCombo = SimulationEngine.SimulateWhole(twoCircleMap,
            [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0), new(1900, 200, 100, 0), new(2000, 200, 100, 1), new(2100, 200, 100, 0)],
            TestFixtures.ScoreV2Mod);
        Assert.True(scoreV2FullCombo.Score == 1_000_000 && scoreV2FullCombo.MaxCombo == 2 && scoreV2FullCombo.Judgements[0].ScoreAfter < scoreV2FullCombo.Score,
            "stable ScoreV2 full combo normalizes across all objects");

        var scoreV2OneHundred = SimulationEngine.SimulateWhole(twoCircleMap,
            [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1100, 100, 100, 0), new(1900, 200, 100, 0), new(2060, 200, 100, 1), new(2100, 200, 100, 0)],
            TestFixtures.ScoreV2Mod);
        Assert.True(scoreV2OneHundred.Count100 == 1 && scoreV2OneHundred.Score == 461_724, "stable ScoreV2 weights each hit by 1 + combo / 10 before normalizing");
    }

    [Fact]
    public void Sliders()
    {
        const string sliderMap = """
        osu file format v14
        [Difficulty]
        CircleSize:4
        OverallDifficulty:5
        SliderMultiplier:1.4
        SliderTickRate:1
        [TimingPoints]
        0,500,4,2,1,50,1,0
        [HitObjects]
        100,100,1000,2,0,L|200:100,1,100
        """;

        var fullSlider = SimulationEngine.SimulateWhole(sliderMap, [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1357, 200, 100, 1), new(1400, 200, 100, 0)], 0);
        Assert.True(fullSlider.Count300 == 1 && fullSlider.MaxCombo == 2, "expected slider head and tail combo");

        var scoreV2Slider = SimulationEngine.SimulateWhole(sliderMap,
            [new(900, 100, 100, 0), new(1060, 100, 100, 1), new(1357, 200, 100, 1), new(1400, 200, 100, 0)], TestFixtures.ScoreV2Mod);
        Assert.True(scoreV2Slider.Count100 == 1, "stable ScoreV2 caps slider result to head timing judgement");

        var missedSliderHead = SimulationEngine.SimulateWhole(sliderMap,
            [new(900, 400, 300, 0), new(1000, 400, 300, 0), new(1100, 400, 300, 1), new(1300, 190, 100, 1), new(1357, 200, 100, 1), new(1400, 200, 100, 0)],
            TestFixtures.ScoreV2Mod);
        Assert.True(missedSliderHead.Count50 == 1 && missedSliderHead.Misses == 0 && missedSliderHead.MaxCombo == 1,
            "stable ScoreV2 missed slider head with a tracked tail gives a 50 and a combo break");

        var droppedTail = SimulationEngine.SimulateWhole(sliderMap, [new(900, 100, 100, 0), new(1000, 100, 100, 1), new(1200, 160, 100, 0), new(1357, 200, 100, 0)], 0);
        Assert.True(droppedTail.Count100 == 1 && droppedTail.MaxCombo == 1, "expected dropped slider tail to reduce judgement without breaking head combo");
    }

    [Fact]
    public void StableSliderTailOrdering()
    {
        const string stableTailOrderMap = "osu file format v14\n[Difficulty]\nCircleSize:4\nOverallDifficulty:8\nSliderMultiplier:1.7\nSliderTickRate:1\n"
            + "[TimingPoints]\n0,324.324324,4,2,1,50,1,0\n[HitObjects]\n266,349,10061,2,0,P|214:347|170:338,1,85\n";
        var stableTailOrder = SimulationEngine.SimulateWhole(stableTailOrderMap,
        [
            new(10060, 301.7, 346.3, 0), new(10077, 301, 348, 0), new(10088, 299.7, 347, 10),
            new(10110, 291.3, 343, 10), new(10127, 281, 341, 10), new(10141, 268.3, 340.7, 15),
            new(10160, 254.3, 341.3, 15), new(10177, 243, 341.3, 10), new(10187, 236, 341, 10),
            new(10223, 211.7, 338.3, 10)
        ], 1 << 29);
        Assert.True(stableTailOrder.Count100 == 1 && stableTailOrder.SliderEndsHit == 0,
            "stable slider tail judgement precedes input at the same integer millisecond");
    }

    [Fact]
    public void SpinnerInterruptedAndCompleted()
    {
        var interruptedSpin = SimulationEngine.SimulateWhole(TestFixtures.SpinnerMap,
        [
            new(1000, 356, 192, 1), new(1100, 256, 292, 1), new(1200, 156, 192, 1),
            new(1300, 256, 92, 1), new(1400, 350, 158, 1), new(1500, 350, 158, 0),
            new(1600, 162, 226, 1), new(2000, 162, 226, 0)
        ], 0);
        Assert.True(interruptedSpin.SpinnerSpins >= 1, "spinner must retain the last cursor angle while input is released, matching lazer rotation tracking");

        SimulationFrame[] completedSpinFrames =
        [
            new(1000, 356, 192, 1), new(1100, 256, 292, 1), new(1200, 156, 192, 1), new(1300, 256, 92, 1),
            new(1400, 356, 192, 1), new(1500, 256, 292, 1), new(1600, 156, 192, 1), new(1700, 256, 92, 1),
            new(1800, 356, 192, 1), new(1900, 256, 292, 1), new(2000, 356, 192, 0)
        ];
        var completedSpin = SimulationEngine.SimulateWhole(TestFixtures.SpinnerMap, completedSpinFrames, 0);
        Assert.True(completedSpin.Count300 == 1 && completedSpin.SpinnerSpins >= 1 && completedSpin.BonusScore > 0,
            "spinner must expose rotations and score contribution");

        var calibratedSpin = SimulationEngine.ReconcileRecordedStableScore(completedSpin, completedSpin.Score - 100,
            completedSpin.MaxCombo, [completedSpin.Count300, completedSpin.Count100, completedSpin.Count50, 0, 0, completedSpin.Misses],
            true, 0, 0);
        Assert.True(calibratedSpin.Score == completedSpin.Score - 100 && calibratedSpin.BonusScore == completedSpin.BonusScore - 100,
            "an unedited stable replay with matching judgements and combo calibrates the residual spinner score");

        var editedSpin = SimulationEngine.ReconcileRecordedStableScore(completedSpin, completedSpin.Score - 100,
            completedSpin.MaxCombo, [completedSpin.Count300, completedSpin.Count100, completedSpin.Count50, 0, 0, completedSpin.Misses],
            false, 0, 0);
        Assert.True(editedSpin.Score == completedSpin.Score, "edited replay score must remain simulation-derived");

        var hagaFixture = completedSpin with
        {
            Score = 27_226_417,
            BonusScore = 32_500,
            Count300 = 797,
            Count100 = 0,
            Count50 = 0,
            Misses = 0,
            MaxCombo = 1159,
            SpinnerSpinsTotal = 64
        };
        var calibratedHaga = SimulationEngine.ReconcileRecordedStableScore(hagaFixture, 27_221_817, 1159, [797, 0, 0, 0, 0, 0], true, 72, 72);
        Assert.True(calibratedHaga.Score == 27_221_817 && calibratedHaga.BonusScore == 27_900,
            "Haga DTHD fixture must reconcile the residual 4,600 stable spinner points");
    }

    [Fact]
    public void SpinnerScoreV2Bonus()
    {
        const string spinnerBonusMap = "osu file format v14\n[Difficulty]\nOverallDifficulty:0\n[HitObjects]\n256,192,1000,8,0,4000\n";
        var spinnerBonusFrames = Enumerable.Range(0, 101)
            .Select(index => new SimulationFrame(1000 + 30L * index, 256 + 100 * Math.Cos(2 * Math.PI * 12 * index / 100), 192 + 100 * Math.Sin(2 * Math.PI * 12 * index / 100), 1))
            .ToArray();

        var completedSpinV1Bonus = SimulationEngine.SimulateWhole(spinnerBonusMap, spinnerBonusFrames, 0);
        var completedSpinV2 = SimulationEngine.SimulateWhole(spinnerBonusMap, spinnerBonusFrames, 1 << 29);
        Assert.True(completedSpinV2.BonusScore < completedSpinV1Bonus.BonusScore && completedSpinV2.SpinnerBonusHit == completedSpinV1Bonus.SpinnerBonusHit,
            "stable ScoreV2 uses its 500-point spinner bonus events without changing spin counts");

        var calibratedSpinV2 = SimulationEngine.ReconcileRecordedStableScore(completedSpinV2, completedSpinV2.Score + 500,
            completedSpinV2.MaxCombo, [completedSpinV2.Count300, completedSpinV2.Count100, completedSpinV2.Count50, 0, 0, completedSpinV2.Misses],
            true, 1 << 29, 1 << 29);
        Assert.True(calibratedSpinV2.Score == completedSpinV2.Score + 500 && calibratedSpinV2.BonusScore == completedSpinV2.BonusScore + 500,
            "unedited stable ScoreV2 can reconcile spinner bonus after hit counts and maximum combo match");
    }

    [Fact]
    public void SpinnerThresholds()
    {
        const string spinnerThresholdMap = "osu file format v14\n[Difficulty]\nOverallDifficulty:10\n[HitObjects]\n256,192,1000,8,0,3583\n";
        var spinnerThresholdFrames = Enumerable.Range(0, 73).Select(index =>
        {
            var angle = 8.75 * Math.PI * 2 * index / 72;
            return new SimulationFrame(1000 + (long)Math.Round(2582d * index / 72), 256 + 100 * Math.Cos(angle), 192 + 100 * Math.Sin(angle), 1);
        }).ToArray();

        var stableThresholdSpin = SimulationEngine.SimulateWhole(spinnerThresholdMap, spinnerThresholdFrames, 0);
        var lazerThresholdSpin = SimulationEngine.SimulateWhole(spinnerThresholdMap, spinnerThresholdFrames, 0, 30_000_001);
        Assert.True(stableThresholdSpin.Count300 == 1, "stable spinner completion above 90% must receive 300 using legacy judgement thresholds");
        Assert.True(lazerThresholdSpin.Count100 == 1, "lazer spinner completion below 100% and above 90% must receive 100");
        Assert.True(stableThresholdSpin.SpinnerBonusHit == stableThresholdSpin.SpinnerBonusTotal,
            "stable exposes every earned spinner bonus without a map-defined bonus limit");
    }

    [Fact]
    public void LazerSpinnerModel()
    {
        var lazerSpin = SimulationEngine.SimulateWhole(TestFixtures.SpinnerMap,
        [
            new(1000, 356, 192, 1), new(1100, 256, 292, 1), new(1200, 156, 192, 1), new(1300, 256, 92, 1),
            new(1400, 356, 192, 1), new(1500, 256, 292, 1), new(1600, 156, 192, 1), new(1700, 256, 92, 1),
            new(1800, 356, 192, 1), new(1900, 256, 292, 1), new(2000, 356, 192, 0)
        ], 0, 30000001);
        Assert.True(lazerSpin.Model == "editor-lazer-v1" && lazerSpin.BonusScore > 0, "lazer spinner model must include spin score");
    }

    [Fact]
    public void LazerSpinnerAwardsLargeBonusAfterBothCompletionSpins()
    {
        const string map = "osu file format v14\n[Difficulty]\nOverallDifficulty:10\n[HitObjects]\n256,192,9470,8,0,11187\n";
        var frames = Enumerable.Range(0, 101).Select(index =>
        {
            var angle = 9.668 * Math.PI * 2 * index / 100;
            return new SimulationFrame(9470 + (long)Math.Round(1716d * index / 100),
                256 + 100 * Math.Cos(angle), 192 + 100 * Math.Sin(angle), 1);
        }).ToArray();

        var result = SimulationEngine.SimulateWhole(map, frames, 0, 30_000_001);

        Assert.True(result.SpinnerSpinsHit == 8 && result.SpinnerSpinsTotal == 8,
            "lazer small bonuses include the two completion spins");
        Assert.True(result.SpinnerBonusHit == 1 && result.SpinnerBonusTotal == 4 && result.BonusScore == 130,
            "lazer awards the first large bonus only after both completion spins");
    }

    [Fact]
    public void LazerSpinnerDoesNotTurnSecondCompletionSpinIntoLargeBonus()
    {
        const string map = "osu file format v14\n[Difficulty]\nOverallDifficulty:9.4\n[HitObjects]\n256,192,1000,8,0,2105\n";
        var frames = Enumerable.Range(0, 101).Select(index =>
        {
            var angle = 5.785 * Math.PI * 2 * index / 100;
            return new SimulationFrame(1000 + (long)Math.Round(1104d * index / 100),
                256 + 100 * Math.Cos(angle), 192 + 100 * Math.Sin(angle), 1);
        }).ToArray();

        var result = SimulationEngine.SimulateWhole(map, frames, 0, 30_000_001);

        Assert.True(result.SpinnerSpinsHit == 5 && result.SpinnerSpinsTotal == 5,
            "both completion spins are reported as small bonuses");
        Assert.True(result.SpinnerBonusHit == 0 && result.SpinnerBonusTotal == 2 && result.BonusScore == 50,
            "the second completion spin must not also be reported as a large bonus");
    }
}
