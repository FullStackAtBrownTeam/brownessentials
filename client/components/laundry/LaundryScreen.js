import React, { Component, Fragment } from "react";
import { StyleSheet, Text, View, Alert } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { connect } from "react-redux";
import LottieView from "lottie-react-native";

import {
    addNotification,
    deleteNotification,
    addStarred,
    deleteStarred,
} from "../../redux/ActionCreators";
import LaundryCard from "./LaundryCard";
import Header from "../reusable/Header";
import {
    askNotification,
    scheduleNotification,
    cancelNotification,
} from "../reusable/Notifications";
import { fetchLaundryAll } from "./queries";

const mapStateToProps = (state) => {
    return {
        starred: state.laundry.starred,
        notifications: state.notifications.notifications,
    };
};

const mapDispatchToProps = (dispatch) => ({
    addNotification: (notification) => dispatch(addNotification(notification)),
    deleteNotification: (notification) =>
        dispatch(deleteNotification(notification)),
    addStarred: (flag) => dispatch(addStarred(flag)),
    deleteStarred: (flag) => dispatch(deleteStarred(flag)),
});

// Component representing the laundry screen
class LaundryScreen extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            emptySearchBar: true,
            suggestions: [],
            suggestionsLimit: 10,
        };

        this.cards = null; // to be fetched
        this.canLoadMore = true; // continue infinite scroll

        this.fetchCards = this.fetchCards.bind(this);
        this.onTextChanged = this.onTextChanged.bind(this);
        this.onNotifChanged = this.onNotifChanged.bind(this);
        this.onStarChanged = this.onStarChanged.bind(this);
        this.isCloseToBottom = this.isCloseToBottom.bind(this);
        this.onNotif = this.onNotif.bind(this);
    }

    componentDidMount() {
        // clean out past notifications from redux by looking at notifTime
        const now = new Date().getTime();
        this.props.notifications
            .map((str) => [str, str.split("///")]) // split -> [roomId, machineId, notifId, notifTime]
            .filter((arr) => arr[1].length != 4 || arr[1][3] <= now)
            .forEach((arr) => {
                this.props.deleteNotification(arr[0]);
            });

        // set timeouts to call onNotif()
        this.notifTimeouts = this.props.notifications.map((str) =>
            setTimeout(() => this.onNotif(str), str.split("///")[3] - now)
        );

        this.fetchCards();
    }

    componentWillUnmount() {
        // clear timeouts for showing notif popup and cleaning notifcations out of redux
        this.notifTimeouts.map(clearTimeout);
    }

    // fetches cards and then cleans this.props.starred during loading
    fetchCards = async () => {
        if (!this.state.loading) {
            this.setState({ loading: true });
        }
        this.cards = await fetchLaundryAll();
        const fetchedCardsKeys = Object.keys(this.cards);
        this.props.starred.forEach((s) => {
            if (!fetchedCardsKeys.includes(s)) {
                this.props.deleteStarred(s);
            }
        });

        this.setState({ loading: false });
    };

    // Called on notification; deletes notification from redux and updates
    onNotif = (notifInfo, alertTitle, alertBody) => {
        this.props.deleteNotification(notifInfo);
        Alert.alert(alertTitle, alertBody);
    };

    // Called when a card is starred or unstarred
    onStarChanged = (card) => {
        if (this.props.starred.includes(card)) {
            this.props.deleteStarred(card);
        } else {
            this.props.addStarred(card);
        }
    };

    // Called when a machine's notification is set or unset
    onNotifChanged = (roomId, roomName) => (machineId, machineName) => async (timeRemaining) => {
        const roomMachine = `${roomId}///${machineId}`;
        const prevNotifs = this.props.notifications.filter((n) =>
            n.startsWith(roomMachine)
        );

        if (prevNotifs.length > 0) {
            // delete notif
            prevNotifs.forEach((p) => {
                const notifId = p.split("///")[2];
                this.props.deleteNotification(p);
                cancelNotification(notifId);
                return false;
            });
        } else {
            // add notif
            askNotification(); // ensure we have notification permissions

            const notifBody = `${roomName} - ${machineName} has finished.`;
            const [notifId, notifTime] = await scheduleNotification(
                "Laundry Ready",
                notifBody,
                timeRemaining
            );
            const newNotif = [roomMachine, notifId, notifTime].join("///");
            const now = new Date().getTime();

            this.props.addNotification(newNotif);
            this.notifTimeouts.push(
                setTimeout(
                    () => this.onNotif(newNotif, "Laundry Ready", notifBody),
                    notifTime - now
                )
            );
            return true;
        }
    };

    // Called on search bar text change
    onTextChanged = (text) => {
        let emptySearchBar = true;
        let newSuggestions = [];
        if (text.length > 0) {
            emptySearchBar = false;
            newSuggestions = Object.keys(this.cards)
                .filter((v) => v.toLowerCase().indexOf(text.toLowerCase()) != -1)
                .sort();
        }

        this.setState({
            emptySearchBar,
            suggestions: newSuggestions,
            suggestionsLimit: 10,
        });
    };

    // Determines if ScrollView is close to the bottom
    isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }) => {
        const paddingToBottom = 5;
        return (
            layoutMeasurement.height + contentOffset.y >=
        contentSize.height - paddingToBottom
        );
    };

    // Returns scrolling card view, given list of rooms (keys) to be rendered
    // isSliced should be false when toMap is the list of starred cards
    mapToCards(toMap, isSliced) {
        if (isSliced) {
            this.canLoadMore = toMap.length > this.state.suggestionsLimit;
        }

        return (
            <Fragment>
                {(isSliced ? toMap.slice(0, this.state.suggestionsLimit) : toMap).map(
                    (room) => (
                        <LaundryCard
                            key={room}
                            card={this.cards[room]}
                            isStarred={this.props.starred.includes(room)}
                            notifList={this.props.notifications
                                .map(str => str.split("///")) // split into [roomId, machineId, ...]
                                .filter(arr => arr[0] === room) // check room
                                .map(arr => arr[1])} // extract machine id
                            starAction={() => this.onStarChanged(room)}
                            notifAction={this.onNotifChanged(room, this.cards[room].title)}
                        />
                    )
                )}
            </Fragment>
        );
    }

    // Returns search results (cards), starred laundry rooms, or no results message
    renderSuggestions() {
        const { emptySearchBar, suggestions } = this.state;
        let starred = this.props.starred.sort();

        if (emptySearchBar) {
            if (starred.length === 0) {
                // no search, display "no starred rooms" message
                return (
                    <Fragment>
                        <Text style={styles.textCentered}>
                No starred laundry rooms to show. Starred rooms will appear at the
                top.
                        </Text>
                        <View style={styles.horizontalLine} />
                        {this.mapToCards(Object.keys(this.cards), true)}
                    </Fragment>
                );
            } else {
                // no search, display 1+ starred rooms at top
                return (
                    <Fragment>
                        {this.mapToCards(starred, false)}
                        <View style={styles.horizontalLine} />
                        {this.mapToCards(
                            Object.keys(this.cards).filter(card => !starred.includes(card)),
                            true
                        )}
                    </Fragment>
                );
            }
        } else {
            if (suggestions.length === 0) {
                // "no results found" message
                this.canLoadMore = false;
                return (
                    <Fragment>
                        <Text style={styles.textCentered}>No results found.</Text>
                        {starred.length !== 0 && <View style={styles.horizontalLine} />}
                        {this.mapToCards(starred, false)}
                    </Fragment>
                );
            } else {
                // display results with starred results at top
                return (
                    <Fragment>
                        {this.mapToCards(
                            suggestions.filter(card => starred.includes(card)),
                            false
                        )}
                        {suggestions.some(card => starred.includes(card)) &&
                        <View style={styles.horizontalLine} />}
                        {this.mapToCards(
                            suggestions.filter(card => !starred.includes(card)),
                            true
                        )}
                    </Fragment>
                );
            }
        }
    }

    render() {
        if (this.state.loading) {
            return (
                <View style={styles.loading}>
                    <LottieView
                        source={require("./animations/dotted-loader.json")}
                        autoPlay
                        loop
                        style={{
                            width: "100%",
                            height: "auto",
                        }}
                    />
                </View>
            );
        }
        return (
            <View style={styles.screen}>
                <Header onChangeText={this.onTextChanged}>Laundry</Header>
                <ScrollView
                    onMomentumScrollEnd={({ nativeEvent }) => {
                        if (this.canLoadMore && this.isCloseToBottom(nativeEvent)) {
                            this.setState((state) => {
                                return { suggestionsLimit: state.suggestionsLimit + 10 };
                            });
                        }
                    }}
                    scrollEventThrottle={0}
                >
                    {this.renderSuggestions()}
                    {this.canLoadMore && (
                        <LottieView
                            source={require("./animations/small-loader.json")}
                            autoPlay
                            loop
                            style={{
                                marginTop: -16,
                                marginBottom: -50,
                                width: "auto",
                                height: 160,
                                alignSelf: "center",
                            }}
                        />
                    )}
                </ScrollView>
            </View>
        );
    }
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#f9f9f9",
    },
    textInput: {
        borderWidth: 0,
        marginLeft: 10,
        marginRight: 10,
        flex: 1,
        fontSize: 18,
        color: "#9C9C9C",
    },
    textCentered: {
        marginLeft: 18,
        marginRight: 18,
        marginTop: 4,
        marginBottom: 7,
        textAlign: "center",
        fontSize: 20,
        color: "#9C9C9C",
    },
    smallTextCentered: {
        margin: 18,
        textAlign: "center",
        fontSize: 16,
        color: "#9C9C9C",
    },
    searchBar: {
        borderWidth: 0,
        borderRadius: 25,
        borderColor: "#BCBCBC",
        padding: 10,
        paddingLeft: 12,
        margin: 12,
        width: "88%",
        flexDirection: "row",
        alignSelf: "center",
        alignItems: "center",

        // shadows for ios
        shadowColor: "black",
        shadowRadius: 2,
        shadowOpacity: 0.25,
        backgroundColor: "white",
        shadowOffset: {
            width: 0,
            height: 1,
        },

        // shadows for android
        elevation: 5,
    },
    loading: {
        flex: 1,
        justifyContent: "center",
    },
    horizontalLine: {
        marginTop: 4,
        marginBottom: 14,
        alignSelf: "center",
        width: "86%",
        borderBottomColor: "#D3D3D3",
        borderBottomWidth: 1,
    },
});

// connect to redux
export default connect(mapStateToProps, mapDispatchToProps)(LaundryScreen);
