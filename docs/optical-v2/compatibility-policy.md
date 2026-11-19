# Optical format compatibility

V2-M3 uses the version identifier `2.0.0-m3.1` on generated card and scene artifacts. Future V2 OfficialResult values carry the format identifier. V1 and V2 cards are separate print runs. V1 uses 25 data cells per fragment and V2-M3 reserves 15, so there is no compatible shared bit-pattern layout for the chosen geometry. The frozen V1 codebook is preserved and the V2 mapping is defined by its own versioned algorithm.

O-9 (coexistence or retirement) is **not yet decided**. The M3 module is isolated from V1 and the game. A release or compatibility claim requires later evidence and owner decisions.
