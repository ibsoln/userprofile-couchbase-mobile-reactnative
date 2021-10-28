import React from 'react'
import { SafeAreaView, Text, TouchableOpacity, StatusBar, DeviceEventEmitter, View, Button, Image, TextInput } from 'react-native'
import { whole } from '../assets/styles/stylesheet'
import { launchImageLibrary } from 'react-native-image-picker'
import CbliteAndroid from 'react-native-cblite'

const options = {
    title: 'Select image',
    storageOptions: {
        skipBackup: true,
        path: 'images',
    },
    includeBase64: true
};

const CouchbaseNativeModule = CbliteAndroid;

export default class Profile extends React.Component {

    static navigationOptions = {
        headerShown: true,

    };

    state = {
        loaded: false,
        UserObject: {},
        replicators: [],
        imagepath: require('../assets/img/avatar.png'),
    }

    constructor(props) {
        super(props);
    }

    getDocumentOnsuccessCallback = (successResponse) => {

        let result = successResponse;
        console.log("getDoc : ", result);


        if (result != null && result != "Document is null") {

            var userobj = JSON.parse(result);

            this.setState({
                UserObject: userobj,
                name: userobj.name,
                address: userobj.address,
                university: userobj.university
            });

            if (userobj.image) {

                CouchbaseNativeModule.getBlob(this.state.dbname, userobj.image, (imageBlob) => {

                    const encodedBase64 = imageBlob;
                    let imageuri = { uri: `data:${userobj.image.content_type};base64,${encodedBase64}` }
                    this.setState({
                        imagepath: imageuri,
                    });

                }, (errorResponse) => {
                    alert("There was a problem while fetching profile image. Details : " + errorResponse);
                });
            }

        }
    }

    getDocumentOnerrorCallback = (errorResponse) => {
        if (!errorResponse == "Document not found") {
            alert("There was a problem while fetching the user data. Details : " + errorResponse);
        }
    }

    componentDidMount = async () => {

        //setup
        var id = this.props.navigation.state.params.username;
        var pass = this.props.navigation.state.params.password;
        let docId = `user::${id}`;
        let dbName = `userprofile`;

        this.setState({
            email: id,
            docid: docId,
            dbname: dbName
        });

        CouchbaseNativeModule.getDocument(dbName, docId, this.getDocumentOnsuccessCallback, this.getDocumentOnerrorCallback);

        //add sync
        this.syncSetup(dbName, id, pass);

        //stopping sync
        var loggingResponse = await CouchbaseNativeModule.enableConsoleLogging("REPLICATOR", "DEBUG")
        console.log("logging", loggingResponse);

    }

    syncSetup(dbname, authUsername, authpassword) {
        // var config = ReplicatorConfiguration.init(database: db, target: URLEndpoint.init(url:"ws://localhost:4984/userprofile"))
        // config.authenticator =  BasicAuthenticator(username: user, password: password)

        // let authUsername="demo@example.com"
        // let authpassword="password"

        var config = {
            databaseName: dbname,
            target: "ws://10.0.2.2:4984/userprofile",
            authenticator: {
                authType: "Basic",
                username: authUsername,
                password: authpassword
            }
        }

        //start replicator
        CouchbaseNativeModule.replicatorStart(dbname, config, (sucess) => {
            console.log("sync success", sucess)
            var response = JSON.parse(sucess);
            if (response.status == "Success") {

                //add listeners
                var ReplicatorID = response.ReplicatorID;
                this.setState({ replicators: [...ReplicatorID] });

                var jsListner = "ReplicatorChangeEvent" + ReplicatorID;
                var x = CouchbaseNativeModule.replicationAddListener(dbname, ReplicatorID, jsListner);
                console.log("Add Listner :", x);
                if (x == "Success") {
                    //start listening
                    DeviceEventEmitter.addListener(jsListner, this.onDbchange);
                }

            }
        }, (eror) => {
            console.error("sync error", eror)
        });

    }

    syncStop = async (dbname) => {

        //stop replicators
        this.state.replicators.forEach( async (id) => {
            var ReplicatorStopResposne = await CouchbaseNativeModule.replicatorStop(dbname, id);
            if (ReplicatorStopResposne == "Success") {
                await CouchbaseNativeModule.replicationRemoveListener(dbname, id);
            }
        });

    }

    onDbchange = (event) => {
        if (event.Modified) {
            var docIds = Object.keys(event.Modified);
            var docs = Object.values(event.Modified);
            // console.warn("Event", "Modified");
            // console.warn("Docid", docIds[0]);
            // console.warn("Doc", docs[0]);
        }
    };

    selectpicture = () => {

        launchImageLibrary(options, (response) => {

            if (response.didCancel) {
                console.log('User cancelled image picker');
            } else if (response.error) {
                console.log('ImagePicker Error: ', response.error);
            } else if (response.customButton) {
                console.log('User tapped custom button: ', response.customButton);
            } else {
                const source = { uri: response.assets[0].uri };

                let image = response.assets[0].base64;
                let _imagetype = response.assets[0].type;
                console.log(image, imagetype)
                // You can also display the image using data:
                this.setState({
                    imagepath: source,
                    imagedata: image,
                    imagetype: _imagetype,
                });

            }
        });

    }

    error_callback = (ErrorResponse) => {
        alert("Error while logout, please try again.")
    }

    saveProfile = () => {

        var data = this.state.UserObject;
        data.type = "user";
        data.email = this.state.email;
        data.name = this.state.name;
        data.address = this.state.address;
        data.university = this.state.university;

        if (this.state.imagedata) {
            let blob = CouchbaseNativeModule.setBlob(this.state.dbname, this.state.imagetype, this.state.imagedata);
            if (blob.length) {
                data.image = blob;
            }
        }
        console.log("User profile data", data);
        CouchbaseNativeModule.setDocument(this.state.dbname, this.state.docid, JSON.stringify(data), this.OnSetDocSuccess,
            (error) => {
                alert(error);
            });

    }

    OnSetDocSuccess = (result) => {

        if (result == 'Success') {
            alert('User Profile Updated');
        }
        else {
            alert('There was a problem while updating the user data. Details : ' + result);
        }

    }

    setuniversity = (name) => {
        this.setState({
            university: name,
        });
    }

    logout = () => {

        //remove listners
        // var removeListnerResponse = CouchbaseNativeModule.removeDatabaseChangeListener(this.state.dbname);
        //if (removeListnerResponse == "Success") {

        //stop listeneing
        // DeviceEventEmitter.removeAllListeners('OnDatabaseChange');

        //close userdb
        CouchbaseNativeModule.closeDatabase(this.state.dbname, (uDBsuccess) => {

            if (uDBsuccess == "Success") {

                //close universities db
                CouchbaseNativeModule.closeDatabase('universities', (uniDBSuccess) => {

                    this.syncStop(this.state.dbname);

                    this.props.navigation.goBack();

                }, this.error_callback);

            }
            else {
                this.error_callback();
            }
        }, this.error_callback);

        //  }


    }

    render() {
        const { navigate } = this.props.navigation;
        return (

            <SafeAreaView style={whole.container}>

                <StatusBar translucent backgroundColor="transparent" barStyle='dark-content' />

                <View style={whole.verticalLinearLayout}>

                    <View>
                        <Image style={whole.profileImage} source={this.state.imagepath}></Image>

                        <Button
                            title="Upload Photo"
                            color="#E62125"
                            style={whole.btnUpload}
                            onPress={this.selectpicture}
                        />

                    </View>

                    <View>
                        <TextInput placeholder="Name" keyboardType='default' onChangeText={(username) => this.setState({ name: username })} style={whole.mtextinput} value={this.state.name} />
                        <TextInput placeholder="Email" editable={false} selectTextOnFocus={false} keyboardType='email-address' onChangeText={(username) => this.setState({ email: username })} style={whole.mtextinput} value={this.state.email} />
                        <TextInput placeholder="Address" keyboardType='default' onChangeText={(username) => this.setState({ address: username })} style={whole.mtextinput} value={this.state.address} />
                        <TouchableOpacity keyboardType='default' style={[whole.mselectinput, { justifyContent: 'space-between', flexDirection: 'row', alignContent: 'center', padding: 10 }]} onPress={() => { navigate("query", { ongoback: this.setuniversity }) }}>
                            <Text>{this.state.university ? this.state.university : "Select University"}</Text><Text>{">"}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={whole.centerLayoutProfile}>
                        <Button
                            title="Logout"
                            color="#E62125"
                            style={whole.button}
                            onPress={this.logout} />

                        <Button
                            title="Save"
                            color="#888"
                            style={whole.button}
                            onPress={this.saveProfile}
                        />
                    </View>
                </View>




            </SafeAreaView>
        );
    }
}