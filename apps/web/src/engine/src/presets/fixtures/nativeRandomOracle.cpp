// Standalone Boost/Qt CPU reference; see nativeRandom.vectors.json provenance.
// No Krita implementation source is linked or copied into the application.
#include <boost/random/taus88.hpp>
#include <boost/random/uniform_smallint.hpp>
#include <boost/version.hpp>
#include <QtCore/QJsonArray>
#include <QtCore/QJsonDocument>
#include <QtCore/QJsonObject>
#include <QtCore/QString>
#include <QtCore/qhashfunctions.h>
#include <iostream>
#include <sstream>
#include <vector>
QJsonArray state(const boost::taus88 &source) {
    std::ostringstream serialized; serialized << source;
    std::istringstream parsed(serialized.str());
    QJsonArray result; quint32 value;
    while (parsed >> value) result.append(double(value));
    return result;
}
QJsonArray raw(boost::taus88 &source, int count) {
    QJsonArray result;
    for (int i = 0; i < count; i++) result.append(double(source()));
    return result;
}
int main() {
    const std::vector<quint32> seeds = {0, 1, 2, 7, 8, 15, 16, 341, 0x12345678u, 0x7fffffffu, 0x80000000u, 0xffffffffu};
    const std::vector<QString> keys = {QString(), QStringLiteral("RotationFuzzyStroke"), QStringLiteral("SizeFuzzyStroke"), QString::fromUtf8("кистьFuzzyStroke"), QString::fromUtf8("水彩🎨"), QString::fromUtf8("a\0b", 3), QString::fromUtf8("é"), QString::fromUtf8("é")};
    QJsonArray cases;
    for (quint32 seed : seeds) {
        QJsonObject row{{"seed", double(seed)}, {"nativeSignedSeed", int(qint32(seed))}};
        boost::taus88 source(seed);
        row.insert("initialState", state(source)); row.insert("raw", raw(source, 16)); row.insert("stateAfter16", state(source));
        boost::taus88 normalized(seed); QJsonArray fractions;
        for (int i = 0; i < 8; i++) fractions.append(double(normalized()) / normalized.max());
        row.insert("normalized", fractions);
        boost::taus88 bounded(seed); QJsonArray ints;
        for (auto bounds : std::vector<std::pair<int, int>>{{0,0},{0,1},{0,6},{-5,5},{-2147483647-1,2147483647},{2147483647,2147483647}}) {
            boost::uniform_smallint<int> distribution(bounds.first, bounds.second);
            ints.append(QJsonObject{{"min",bounds.first},{"max",bounds.second},{"value",distribution(bounded)}});
        }
        row.insert("bounded", ints); row.insert("stateAfterBounded", state(bounded));
        boost::taus88 original(seed); raw(original, 5); row.insert("cloneState", state(original));
        boost::taus88 copy(original); std::ostringstream serialized; serialized << original;
        boost::taus88 restored(0); std::istringstream input(serialized.str()); input >> restored;
        const QJsonArray expected = raw(original, 8);
        if (raw(copy, 8) != expected || raw(restored, 8) != expected) return 2;
        row.insert("cloneNext", expected);
        QJsonArray keyed;
        for (const auto &key : keys) {
            const quint32 hash = qHash(key); boost::taus88 oneTime(seed + hash); const quint32 value = oneTime();
            keyed.append(QJsonObject{{"key",key},{"hash",double(hash)},{"raw",double(value)},
                {"normalized",double(value)/oneTime.max()},{"boundedMinus3To5Exclusive",int(-3 + value % 8)}});
        }
        row.insert("keyed", keyed); cases.append(row);
    }
    QJsonArray endpoints;
    for (const auto &encoded : {"0 0 0", "1048510 16384 0"}) {
        boost::taus88 endpoint(0); std::istringstream input(encoded); input >> endpoint;
        const auto initial = state(endpoint); const quint32 value = endpoint();
        endpoints.append(QJsonObject{{"state",initial},{"raw",double(value)},{"normalized",double(value)/endpoint.max()}});
    }
    const QJsonObject result{{"endpoints",endpoints},{"schemaVersion",1},{"provenance",QJsonObject{
        {"boost",BOOST_LIB_VERSION},{"qtHeaders",QT_VERSION_STR},{"qtRuntime",qVersion()},
        {"compiler",__VERSION__},{"note","Local Boost/Qt CPU oracle, not the Krita AppImage binary or consumer-order trace"}}},{"cases",cases}};
    std::cout << QJsonDocument(result).toJson(QJsonDocument::Indented).constData();
}
